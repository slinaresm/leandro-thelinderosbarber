"""Publica un destino fijo, después de respaldar y verificar su contenido anterior."""
import ftplib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import ssl
import tarfile

spec = importlib.util.spec_from_file_location('private_setup', Path(__file__).with_name('private-setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
PRESERVE = {'.well-known', 'cgi-bin', '.ftpquota', 'ftpquota'}
LEGACY = {'admin', 'api', 'assets', 'barbero', 'cliente', '.ftp-deploy-sync-state.json',
          '.htaccess', 'index.html', 'login.html', 'politicas-servicio.html', 'producto.html',
          'productos.html', 'register.html'}
CLOSED = b'ErrorDocument 503 "Publicacion en curso"\nRewriteEngine On\nRewriteRule ^ - [R=503,L]\n'


def valid_name(name):
    if not name or name in ('.', '..') or '/' in name or '\\' in name or '..' in name:
        raise setup.SetupError('UNSAFE_REMOTE_NAME')


def inventory(ftp, allowed):
    files, directories = {}, []
    total = 0

    def walk(prefix=''):
        nonlocal total
        for name, facts in ftp.mlsd(prefix or '.'):
            if name in ('.', '..'):
                continue
            valid_name(name)
            if not prefix and name in PRESERVE:
                continue
            if not prefix and name not in allowed:
                raise setup.SetupError('UNEXPECTED_PUBLIC_ENTRY')
            relative = prefix + '/' + name if prefix else name
            if facts.get('type') == 'dir':
                directories.append(relative)
                if len(directories) > 500:
                    raise setup.SetupError('BACKUP_LIMIT')
                walk(relative)
            elif facts.get('type') == 'file':
                size = int(facts.get('size', 0))
                total += size
                if len(files) >= 2000 or total > 128 * 1024 * 1024 or size > 32 * 1024 * 1024:
                    raise setup.SetupError('BACKUP_LIMIT')
                files[relative] = (size, facts.get('modify', ''))
            else:
                raise setup.SetupError('UNSAFE_REMOTE_TYPE')
    walk()
    return files, sorted(directories)


def store(ftp, name, payload):
    setup.upload_verified(ftp, name, payload, '644')


def publish(public, private, directory, run_id):
    names = sorted(file.relative_to(directory).as_posix() for file in directory.rglob('*') if file.is_file())
    if '.htaccess' not in names or 'gateway.php' not in names or 'index.html' not in names:
        raise setup.SetupError('PUBLIC_PACKAGE_INVALID')
    if any(name.split('/')[0] in PRESERVE or '..' in name or name.startswith('/') for name in names):
        raise setup.SetupError('PUBLIC_PACKAGE_INVALID')
    allowed = LEGACY | {name.split('/')[0] for name in names}
    private.cwd('api/storage/framework')
    if 'down' not in setup.entries(private):
        raise setup.SetupError('API_MAINTENANCE_REQUIRED')
    private.cwd('../../..')
    old_files, old_directories = inventory(public, allowed)
    backup = io.BytesIO()
    with tarfile.open(fileobj=backup, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, (size, _) in sorted(old_files.items()):
            payload = io.BytesIO()
            public.retrbinary('RETR ' + name, payload.write)
            content = payload.getvalue()
            if len(content) != size:
                raise setup.SetupError('SOURCE_CHANGED')
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
    payload = backup.getvalue()
    backup_name = 'rf017-public-before-' + run_id + '.tar'
    if backup_name in setup.entries(private):
        raise setup.SetupError('BACKUP_ALREADY_EXISTS')
    setup.upload_verified(private, backup_name, payload, '600')
    if inventory(public, allowed) != (old_files, old_directories):
        raise setup.SetupError('SOURCE_CHANGED')
    store(public, '.htaccess', CLOSED)
    for name in sorted(old_files):
        if name != '.htaccess':
            public.delete(name)
    for name in sorted(old_directories, key=lambda item: item.count('/'), reverse=True):
        public.rmd(name)
    for name in sorted({str(Path(name).parent).replace('\\', '/') for name in names if '/' in name}, key=lambda item: item.count('/')):
        parent = ''
        for part in name.split('/'):
            parent = parent + '/' + part if parent else part
            if part not in {entry: facts for entry, facts in public.mlsd(str(Path(parent).parent).replace('\\', '/'))}:
                public.mkd(parent)
    for name in names:
        if name not in ('.htaccess', 'index.html'):
            store(public, name, (directory / name).read_bytes())
    store(public, 'index.html', (directory / 'index.html').read_bytes())
    store(public, '.htaccess', (directory / '.htaccess').read_bytes())
    return {'status': 'published-api-maintenance', 'filesPublished': len(names),
            'previousFilesBackedUp': len(old_files), 'backupPrivateFile': backup_name,
            'backupSha256': hashlib.sha256(payload).hexdigest(), 'backupReadBackVerified': True,
            'reservedEntriesPreserved': sorted(PRESERVE), 'apiMaintenanceKept': True, 'databaseWrites': 0}


def connect(role):
    expected = 'lb-api@linderosbarber.cl' if role == 'PRIVATE' else 'lb-web@linderosbarber.cl'
    if (os.environ.get('FTP_SERVER') != 'solu36.tuwebdns.net' or os.environ.get('FTP_PORT') != '21'
            or os.environ.get(role + '_USER') != expected or not os.environ.get(role + '_PASSWORD')):
        raise setup.SetupError('CONFIGURATION_INVALID')
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    ftp = ftplib.FTP_TLS(context=context, timeout=60)
    ftp.connect('solu36.tuwebdns.net', 21)
    ftp.auth()
    ftp.login(expected, os.environ[role + '_PASSWORD'])
    ftp.prot_p()
    expected_root = '/home/leakmcl/apps/linderosbarber-php' if role == 'PRIVATE' else '/home/leakmcl/public_html/linderosbarber.cl'
    if ftp.pwd().rstrip('/') not in ('', expected_root):
        ftp.close()
        raise setup.SetupError('ROOT_UNEXPECTED')
    return ftp


def main():
    public = private = None
    report, code = {'status': 'failed', 'apiMaintenanceKept': True}, 1
    try:
        run_id = os.environ.get('GITHUB_RUN_ID', '')
        if not run_id.isdigit():
            raise setup.SetupError('RUN_INVALID')
        private, public = connect('PRIVATE'), connect('PUBLIC')
        report = publish(public, private, Path('.refactor-data/public-release/public'), run_id)
        code = 0
    except setup.SetupError as error:
        report['code'] = str(error)
    except Exception:
        report['code'] = 'PUBLIC_PUBLICATION_FAILED'
    finally:
        for ftp in (public, private):
            if ftp is not None:
                ftp.close()
    Path('public-web-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
