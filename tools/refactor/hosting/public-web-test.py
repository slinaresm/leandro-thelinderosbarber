import importlib.util
import io
import json
from pathlib import Path
import posixpath
import tarfile
import unittest
import uuid

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('public-web-publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class FakeFTP:
    def __init__(self, files, corrupt=False, fail_asset=False):
        self.files = dict(files)
        self.directories = {''}
        for name in files:
            parent = posixpath.dirname(name)
            while parent:
                self.directories.add(parent)
                parent = posixpath.dirname(parent)
        self.current = ''
        self.corrupt = corrupt
        self.fail_asset = fail_asset
        self.writes, self.deleted, self.reads = [], [], []
        self.links = set()

    def resolve(self, name):
        value = posixpath.normpath(posixpath.join(self.current, name))
        return '' if value == '.' else value

    def mlsd(self, name='.'):
        parent = self.resolve(name)
        result = []
        for directory in sorted(self.directories):
            if directory and posixpath.dirname(directory) == parent:
                result.append((posixpath.basename(directory), {'type': 'OS.unix=slink' if directory in self.links else 'dir'}))
        for name, payload in sorted(self.files.items()):
            if posixpath.dirname(name) == parent:
                result.append((posixpath.basename(name), {'type': 'file', 'size': str(len(payload)), 'modify': '20261030000000'}))
        return result

    def cwd(self, name):
        self.current = self.resolve(name)
        assert self.current in self.directories

    def storbinary(self, command, source):
        name = self.resolve(command.removeprefix('STOR '))
        if getattr(self, 'fail_once', None) == name:
            self.fail_once = None
            raise RuntimeError('synthetic late upload failure')
        if self.fail_asset and name == 'assets/app.js':
            raise RuntimeError('synthetic upload failure')
        self.files[name] = source.read()
        self.writes.append(name)

    def sendcmd(self, command):
        assert command.startswith('SITE CHMOD ')

    def retrbinary(self, command, callback):
        name = self.resolve(command.removeprefix('RETR '))
        self.reads.append(name)
        callback(b'corrupt' if self.corrupt else self.files[name])

    def delete(self, name):
        assert not name.split('/')[0] in publisher.PRESERVE
        self.deleted.append(name)
        del self.files[name]

    def rmd(self, name):
        assert not any(file.startswith(name + '/') for file in self.files)
        self.directories.remove(name)

    def mkd(self, name):
        assert posixpath.dirname(name) in self.directories
        self.directories.add(name)


class PublicWebTest(unittest.TestCase):
    def setUp(self):
        self.public = FakeFTP({'index.html': b'old', '.htaccess': b'old rules',
                               'assets/old.js': b'old script', '.well-known/token': b'keep',
                               'cgi-bin/reserved': b'keep', '.ftpquota': b'keep'})
        self.private = FakeFTP({'api/.env': b'never-read-secret', 'api/storage/framework/down': b'{}'})
        root = Path(__file__).resolve().parents[3]
        self.directory = root / '.refactor-data' / ('public-publish-test-' + uuid.uuid4().hex)
        (self.directory / 'assets').mkdir(parents=True)
        for name, payload in {'.htaccess': b'new rules', 'index.html': b'new', 'gateway.php': b'<?php', 'assets/app.js': b'new script'}.items():
            (self.directory / name).write_bytes(payload)

    def test_backup_precedes_cleanup_and_all_files_are_verified(self):
        result = publisher.publish(self.public, self.private, self.directory, '123')
        self.assertEqual(result['status'], 'published-api-maintenance')
        self.assertEqual(self.public.files['.well-known/token'], b'keep')
        self.assertEqual(self.public.files['cgi-bin/reserved'], b'keep')
        self.assertEqual(self.public.files['.ftpquota'], b'keep')
        self.assertEqual(self.public.files['.htaccess'], b'new rules')
        self.assertNotIn('assets/old.js', self.public.files)
        self.assertEqual(self.public.writes[-2:], ['index.html', '.htaccess'])
        self.assertNotIn('api/.env', self.private.reads)
        self.assertEqual(self.private.files['api/.env'], b'never-read-secret')
        with tarfile.open(fileobj=io.BytesIO(self.private.files[result['backupPrivateFile']])) as archive:
            self.assertEqual(archive.extractfile('index.html').read(), b'old')
            self.assertEqual(archive.extractfile('.htaccess').read(), b'old rules')
        self.assertNotIn('never-read-secret', json.dumps(result))

    def test_unknown_root_entry_blocks_before_changes(self):
        self.public.files['otro-dominio.cl'] = b'preserve'
        with self.assertRaisesRegex(publisher.setup.SetupError, 'UNEXPECTED_PUBLIC_ENTRY'):
            publisher.publish(self.public, self.private, self.directory, '124')
        self.assertEqual(self.public.writes, [])
        self.assertEqual(self.public.deleted, [])

    def test_symlink_blocks_before_changes(self):
        self.public.links.add('assets')
        with self.assertRaisesRegex(publisher.setup.SetupError, 'UNSAFE_REMOTE_TYPE'):
            publisher.publish(self.public, self.private, self.directory, '125')
        self.assertEqual(self.public.writes, [])

    def test_api_must_remain_in_maintenance(self):
        del self.private.files['api/storage/framework/down']
        with self.assertRaisesRegex(publisher.setup.SetupError, 'API_MAINTENANCE_REQUIRED'):
            publisher.publish(self.public, self.private, self.directory, '126')
        self.assertEqual(self.public.writes, [])

    def test_backup_verification_failure_never_cleans_public_files(self):
        self.private.corrupt = True
        with self.assertRaisesRegex(publisher.setup.SetupError, 'UPLOAD_VERIFICATION_FAILED'):
            publisher.publish(self.public, self.private, self.directory, '127')
        self.assertEqual(self.public.writes, [])
        self.assertEqual(self.public.deleted, [])

    def test_partial_public_upload_keeps_emergency_closure(self):
        self.public.fail_asset = True
        with self.assertRaises(RuntimeError):
            publisher.publish(self.public, self.private, self.directory, '128')
        self.assertEqual(self.public.files['.htaccess'], publisher.CLOSED)
        self.assertIn('rf017-public-before-128.tar', self.private.files)

    def test_front_update_with_live_api_keeps_previous_assets_and_private_state(self):
        del self.private.files['api/storage/framework/down']
        result = publisher.publish(self.public, self.private, self.directory, '129', front_update=True)
        self.assertEqual(result['status'], 'published-front-update')
        self.assertFalse(result['apiMaintenanceActive'])
        self.assertEqual(self.public.files['assets/old.js'], b'old script')
        self.assertEqual(self.public.deleted, [])
        self.assertEqual(self.private.files['api/.env'], b'never-read-secret')
        self.assertNotIn('api/.env', self.private.reads)
        self.assertEqual(self.public.files['.htaccess'], b'new rules')

    def test_front_update_failure_restores_previous_html_and_rules(self):
        del self.private.files['api/storage/framework/down']
        (self.directory / 'z-final.txt').write_bytes(b'late transfer')
        self.public.fail_once = 'z-final.txt'
        with self.assertRaisesRegex(publisher.setup.SetupError, 'FRONT_UPDATE_FAILED_PREVIOUS_RESTORED'):
            publisher.publish(self.public, self.private, self.directory, '130', front_update=True)
        self.assertEqual(self.public.files['index.html'], b'old')
        self.assertEqual(self.public.files['.htaccess'], b'old rules')
        self.assertEqual(self.public.files['assets/old.js'], b'old script')
        self.assertIn('index.html', self.public.writes)


if __name__ == '__main__':
    unittest.main()
