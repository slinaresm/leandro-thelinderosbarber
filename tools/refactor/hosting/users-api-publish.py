"""Actualización RF-023 limitada, sin entorno, migraciones ni datos de usuarios."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import tarfile
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('public_publisher', Path(__file__).with_name('public-web-publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
FILES = ['app/Http/Controllers/AdminUserController.php', 'vendor/composer/autoload_classmap.php', 'vendor/composer/autoload_static.php', 'routes/api.php']


def read_file(ftp, path, optional=False):
    parts = path.split('/')
    for index, part in enumerate(parts):
        parent = '/'.join(parts[:index]) or '.'
        entries = dict(ftp.mlsd(parent))
        facts = entries.get(part)
        if facts is None and optional and index == len(parts) - 1:
            return None
        expected = 'file' if index == len(parts) - 1 else 'dir'
        if facts is None or facts.get('type') != expected:
            raise publisher.setup.SetupError('UNSAFE_OR_MISSING_API_PATH')
    buffer = io.BytesIO()
    ftp.retrbinary('RETR ' + path, buffer.write)
    return buffer.getvalue()


def atomic_store(ftp, path, content, run):
    if read_file(ftp, path, optional=True) == content:
        return
    staged = path + '.rf023-' + run
    publisher.setup.upload_verified(ftp, staged, content, '600')
    ftp.rename(staged, path)
    if read_file(ftp, path) != content:
        raise publisher.setup.SetupError('API_READ_BACK_FAILED')


def publish(private, public, source, run, verify):
    if not run.isdigit():
        raise publisher.setup.SetupError('INVALID_RUN')
    source = Path(source)
    payloads = {name: (source / name).read_bytes() for name in FILES}
    previous = {name: read_file(private, 'api/' + name, optional=name == FILES[0]) for name in FILES}
    if read_file(private, 'api/composer.lock') != (source / 'composer.lock').read_bytes():
        raise publisher.setup.SetupError('DEPENDENCIES_DIFFER')
    suffix = re.compile(rb'class ComposerStaticInit([A-Za-z0-9]+)')
    old_class = suffix.search(previous['vendor/composer/autoload_static.php'])
    new_class = suffix.search(payloads['vendor/composer/autoload_static.php'])
    if not old_class or not new_class or old_class.group(1) != new_class.group(1):
        raise publisher.setup.SetupError('AUTOLOAD_INCOMPATIBLE')
    if any('AdminUserController' not in payloads[name].decode('utf-8') for name in FILES[1:3]):
        raise publisher.setup.SetupError('CONTROLLER_NOT_MAPPED')
    if any(name.startswith('routes') and name.endswith('.php') for name, _ in private.mlsd('api/bootstrap/cache')):
        raise publisher.setup.SetupError('ROUTE_CACHE_REQUIRES_SEPARATE_CLEARANCE')
    original_rules = read_file(public, '.htaccess')
    backup_name = 'rf023-api-before-' + run + '.tar'
    if backup_name in publisher.setup.entries(private):
        raise publisher.setup.SetupError('BACKUP_ALREADY_EXISTS')
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in {**{'api/' + name: data for name, data in previous.items() if data is not None}, 'public/.htaccess': original_rules}.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    backup = buffer.getvalue()
    publisher.setup.upload_verified(private, backup_name, backup, '600')
    if any(read_file(private, 'api/' + name, optional=name == FILES[0]) != data for name, data in previous.items()) or read_file(public, '.htaccess') != original_rules:
        raise publisher.setup.SetupError('SOURCE_CHANGED')
    changed = []
    try:
        publisher.store(public, '.htaccess', publisher.CLOSED)
        for name in FILES:
            changed.append(name)
            atomic_store(private, 'api/' + name, payloads[name], run)
        publisher.store(public, '.htaccess', original_rules)
        if not verify():
            raise publisher.setup.SetupError('API_HTTP_CHECK_FAILED')
    except Exception:
        try:
            publisher.store(public, '.htaccess', publisher.CLOSED)
            for name in reversed(changed):
                old = previous[name]
                if old is not None:
                    atomic_store(private, 'api/' + name, old, run)
                elif read_file(private, 'api/' + name, optional=True) is not None:
                    private.delete('api/' + name)
            publisher.store(public, '.htaccess', original_rules)
        except Exception:
            raise publisher.setup.SetupError('API_PATCH_ROLLBACK_FAILED') from None
        raise publisher.setup.SetupError('API_PATCH_FAILED_PREVIOUS_RESTORED') from None
    return {'status': 'published-users-api', 'filesPublished': FILES, 'backupPrivateFile': backup_name,
            'backupSha256': hashlib.sha256(backup).hexdigest(), 'backupReadBackVerified': True,
            'healthStatus': 200, 'unauthenticatedUsersStatus': 401, 'databaseWrites': 0,
            'migrationsRun': False, 'envModified': False, 'accountsCreated': 0}


def verify_http():
    for attempt in range(5):
        statuses = []
        for path in ['/api/health', '/api/users']:
            try:
                with urllib.request.urlopen('https://linderosbarber.cl' + path, timeout=15) as response:
                    statuses.append(response.status)
            except urllib.error.HTTPError as error:
                statuses.append(error.code)
            except Exception:
                statuses.append(0)
        if statuses == [200, 401]:
            return True
        if attempt < 4:
            time.sleep(3)
    return False


def main():
    private = public = None
    report, code = {'status': 'failed', 'envModified': False, 'databaseWrites': 0}, 1
    try:
        private, public = publisher.connect('PRIVATE'), publisher.connect('PUBLIC')
        report = publish(private, public, Path('api'), os.environ.get('GITHUB_RUN_ID', ''), verify_http)
        code = 0
    except publisher.setup.SetupError as error:
        report['code'] = str(error)
    except Exception:
        report['code'] = 'API_PATCH_FAILED'
    finally:
        for ftp in (private, public):
            if ftp is not None:
                ftp.close()
    Path('users-api-publish-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
