import hashlib
import importlib.util
import json
import os
from pathlib import Path
import ssl
import ftplib
import tarfile

spec = importlib.util.spec_from_file_location('private_setup', Path(__file__).with_name('private-setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
report = {'status': 'failed', 'envModified': False, 'publicFilesWritten': 0, 'databaseWrites': 0}
ftp = None
code = 1
try:
    if (os.environ.get('FTP_SERVER') != 'solu36.tuwebdns.net' or os.environ.get('FTP_PORT') != '21'
            or os.environ.get('PRIVATE_USER') != 'lb-api@linderosbarber.cl' or not os.environ.get('PRIVATE_PASSWORD')):
        raise setup.SetupError('CONFIGURATION_INVALID')
    source = Path('.refactor-data/private-api-release')
    archive = Path('.refactor-data/rf017-private-api.tar')
    with tarfile.open(archive, 'w', format=tarfile.USTAR_FORMAT) as bundle:
        for file in sorted(source.rglob('*')):
            if file.is_symlink():
                raise setup.SetupError('UNSAFE_LOCAL_FILE')
            if file.is_file():
                bundle.add(file, arcname=file.relative_to(source).as_posix(), recursive=False)
    payload = archive.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    wrapper = Path('tools/refactor/hosting/api-unpack.php').read_bytes()
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    ftp = ftplib.FTP_TLS(context=context, timeout=60)
    ftp.connect('solu36.tuwebdns.net', 21)
    ftp.auth()
    ftp.login(os.environ['PRIVATE_USER'], os.environ['PRIVATE_PASSWORD'])
    ftp.prot_p()
    if ftp.pwd().rstrip('/') not in ('', '/home/leakmcl/apps/linderosbarber-php'):
        raise setup.SetupError('ROOT_UNEXPECTED')
    existing = setup.entries(ftp)
    if any(name in existing for name in ['rf017-private-api.tar', 'rf017-private-api.sha256', 'rf017-api-unpack.php', 'rf017-api-unpacked.json', 'rf017-api-install-result.json']):
        raise setup.SetupError('INSTALLATION_FILES_EXIST_NOT_OVERWRITTEN')
    setup.upload_verified(ftp, 'rf017-private-api.tar', payload, '600')
    setup.upload_verified(ftp, 'rf017-private-api.sha256', digest.encode('ascii'), '600')
    setup.upload_verified(ftp, 'rf017-api-unpack.php', wrapper, '600')
    report.update(status='uploaded-awaiting-cron', archiveSha256=digest, archiveBytes=len(payload), readBackVerified=True)
    code = 0
except setup.SetupError as error:
    report['code'] = str(error)
except Exception:
    report['code'] = 'PRIVATE_API_UPLOAD_FAILED'
finally:
    if ftp is not None:
        ftp.close()
Path('private-api-upload-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
raise SystemExit(code)
