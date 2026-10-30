import base64
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('private_setup', Path(__file__).with_name('private-setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class FakeFTP:
    def __init__(self, existing=None, root='/', corrupt=False, api_type='dir'):
        self.location = ''
        self.root = root
        self.api_type = api_type
        self.files = dict(existing or {})
        self.corrupt = corrupt
        self.written = []
        self.permissions = []

    def pwd(self):
        return self.root

    def mlsd(self):
        if not self.location:
            values = [('api', {'type': self.api_type})]
            if 'rf017-preflight.php' in self.files:
                values.append(('rf017-preflight.php', {'type': 'file'}))
            return values
        return [(name[4:], {'type': 'file'}) for name in self.files if name.startswith('api/')]

    def cwd(self, name):
        self.location = '' if name == '..' else name

    def storbinary(self, command, source):
        name = command.removeprefix('STOR ')
        target = (self.location + '/' if self.location else '') + name
        self.files[target] = source.read()
        self.written.append(target)

    def sendcmd(self, command):
        self.permissions.append(command)

    def retrbinary(self, command, callback):
        name = command.removeprefix('RETR ')
        target = (self.location + '/' if self.location else '') + name
        callback(b'corrupt' if self.corrupt else self.files[target])


class PrivateSetupTest(unittest.TestCase):
    def test_keys_are_distinct_valid_and_environment_has_no_database_password(self):
        root = Path(__file__).resolve().parents[3]
        template = (root / 'docs/refactor/hosting/production.env.example').read_text(encoding='utf-8')
        first, second = setup.new_environment(template), setup.new_environment(template)
        self.assertNotEqual(first, second)
        values = dict(line.split('=', 1) for line in first.splitlines() if '=' in line and not line.startswith('#'))
        self.assertEqual(len(base64.b64decode(values['APP_KEY'].removeprefix('base64:'))), 32)
        self.assertEqual(len(base64.b64decode(json.loads(values['JWT_KEYS'].strip("'"))['key-1'])), 48)
        self.assertEqual(values['DB_PASSWORD'], '')
        self.assertEqual(values['AI_MODE'], 'disabled')
        self.assertEqual(values['DB_DATABASE'], 'leakmcl_linderos')

    def test_uploads_only_two_private_files_with_readback_and_permissions(self):
        ftp = FakeFTP()
        result = setup.provision(ftp, 'secret-environment', b'<?php diagnostic')
        self.assertEqual(ftp.written, ['rf017-preflight.php', 'api/.env'])
        self.assertEqual(len(ftp.permissions), 2)
        self.assertEqual(result['publicFilesWritten'], 0)
        self.assertFalse(result['databasePasswordConfigured'])
        self.assertNotIn('secret-environment', json.dumps(result))

    def test_never_overwrites_existing_environment(self):
        ftp = FakeFTP({'api/.env': b'previous-keys'})
        with self.assertRaisesRegex(setup.SetupError, 'ENV_EXISTS_NOT_OVERWRITTEN'):
            setup.provision(ftp, 'replacement-keys', b'diagnostic')
        self.assertEqual(ftp.files['api/.env'], b'previous-keys')
        self.assertEqual(ftp.written, [])

    def test_rejects_unexpected_root_before_any_write(self):
        ftp = FakeFTP(root='/public_html')
        with self.assertRaisesRegex(setup.SetupError, 'ROOT_UNEXPECTED'):
            setup.provision(ftp, 'secret', b'diagnostic')
        self.assertEqual(ftp.written, [])

    def test_rejects_symlink_api(self):
        ftp = FakeFTP(api_type='OS.unix=slink')
        with self.assertRaisesRegex(setup.SetupError, 'UNSAFE_DIRECTORY'):
            setup.provision(ftp, 'secret', b'diagnostic')
        self.assertEqual(ftp.written, [])

    def test_rejects_existing_diagnostic_without_overwriting(self):
        ftp = FakeFTP({'rf017-preflight.php': b'previous'})
        with self.assertRaisesRegex(setup.SetupError, 'PREFLIGHT_EXISTS_NOT_OVERWRITTEN'):
            setup.provision(ftp, 'secret', b'diagnostic')
        self.assertEqual(ftp.written, [])

    def test_aborts_if_uploaded_content_does_not_match(self):
        ftp = FakeFTP(corrupt=True)
        with self.assertRaisesRegex(setup.SetupError, 'UPLOAD_VERIFICATION_FAILED'):
            setup.provision(ftp, 'secret', b'diagnostic')
        self.assertNotIn('api/.env', ftp.files)


if __name__ == '__main__':
    unittest.main()
