import importlib.util
from pathlib import Path
import unittest
import uuid


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


patcher = module('users_publisher', 'users-api-publish.py')
base = module('public_test', 'public-web-test.py')


class FTP(base.FakeFTP):
    def rename(self, source, target):
        if getattr(self, 'fail_target', None) == target:
            self.fail_target = None
            raise RuntimeError('synthetic transfer failure')
        self.files[target] = self.files.pop(source)

    def retrbinary(self, command, callback):
        if getattr(self, 'corrupt_backup', False) and command.startswith('RETR rf023-api-before-'):
            callback(b'bad backup')
        else:
            super().retrbinary(command, callback)


class UsersApiTest(unittest.TestCase):
    def setUp(self):
        self.private = FTP({'api/.env': b'private-secret-never-read', 'api/composer.lock': b'same-lock',
                            'api/app/Http/Controllers/.keep': b'', 'api/routes/api.php': b'old routes',
                            'api/vendor/composer/autoload_classmap.php': b'old map',
                            'api/vendor/composer/autoload_static.php': b'class ComposerStaticInitabc {}',
                            'api/bootstrap/cache/services.php': b'cache'})
        self.public = FTP({'.htaccess': b'original rules', 'index.html': b'old web'})
        self.source = Path(__file__).resolve().parents[3] / '.refactor-data' / ('users-patch-test-' + uuid.uuid4().hex)
        for name, data in {'composer.lock': b'same-lock', **{name: b'AdminUserController new data' for name in patcher.FILES}, 'vendor/composer/autoload_static.php': b'class ComposerStaticInitabc {} // AdminUserController'}.items():
            file = self.source / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)

    def test_limited_patch_keeps_environment_and_public_files(self):
        result = patcher.publish(self.private, self.public, self.source, '123', lambda: True)
        self.assertEqual(result['status'], 'published-users-api')
        self.assertEqual(self.public.files, {'.htaccess': b'original rules', 'index.html': b'old web'})
        self.assertNotIn('api/.env', self.private.reads)
        self.assertEqual(self.private.files['api/.env'], b'private-secret-never-read')
        for name in patcher.FILES:
            self.assertEqual(self.private.files['api/' + name], (self.source / name).read_bytes())

    def test_dependencies_or_loader_mismatch_block_before_mutations(self):
        self.private.files['api/composer.lock'] = b'other lock'
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'DEPENDENCIES_DIFFER'):
            patcher.publish(self.private, self.public, self.source, '124', lambda: True)
        self.assertEqual(self.public.writes, [])
        self.private.files['api/composer.lock'] = b'same-lock'
        self.private.files['api/vendor/composer/autoload_static.php'] = b'class ComposerStaticInitother {}'
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'AUTOLOAD_INCOMPATIBLE'):
            patcher.publish(self.private, self.public, self.source, '124', lambda: True)
        self.assertEqual(self.public.writes, [])

    def test_route_cache_blocks_before_public_changes(self):
        self.private.files['api/bootstrap/cache/routes-v7.php'] = b'cached'
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'ROUTE_CACHE'):
            patcher.publish(self.private, self.public, self.source, '125', lambda: True)
        self.assertEqual(self.public.writes, [])

    def test_symlinks_are_rejected(self):
        self.private.links.add('api/app')
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'UNSAFE_OR_MISSING'):
            patcher.publish(self.private, self.public, self.source, '126', lambda: True)
        self.assertEqual(self.public.writes, [])

    def test_late_failure_restores_original_routes_maps_and_closure(self):
        self.private.fail_target = 'api/routes/api.php'
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'API_PATCH_FAILED_PREVIOUS_RESTORED'):
            patcher.publish(self.private, self.public, self.source, '127', lambda: True)
        self.assertEqual(self.private.files['api/routes/api.php'], b'old routes')
        self.assertEqual(self.private.files['api/vendor/composer/autoload_classmap.php'], b'old map')
        self.assertNotIn('api/app/Http/Controllers/AdminUserController.php', self.private.files)
        self.assertEqual(self.public.files['.htaccess'], b'original rules')

    def test_http_failure_rolls_back_all_four_files(self):
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'API_PATCH_FAILED_PREVIOUS_RESTORED'):
            patcher.publish(self.private, self.public, self.source, '128', lambda: False)
        self.assertEqual(self.private.files['api/routes/api.php'], b'old routes')
        self.assertEqual(self.private.files['api/vendor/composer/autoload_static.php'], b'class ComposerStaticInitabc {}')
        self.assertEqual(self.public.files['.htaccess'], b'original rules')

    def test_bad_backup_never_closes_public_site(self):
        self.private.corrupt_backup = True
        with self.assertRaisesRegex(patcher.publisher.setup.SetupError, 'UPLOAD_VERIFICATION_FAILED'):
            patcher.publish(self.private, self.public, self.source, '129', lambda: True)
        self.assertEqual(self.public.writes, [])


if __name__ == '__main__':
    unittest.main()
