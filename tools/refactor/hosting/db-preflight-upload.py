import ftplib
import importlib.util
import json
import os
from pathlib import Path
import ssl
import sys

spec = importlib.util.spec_from_file_location('private_setup', Path(__file__).with_name('private-setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
ftp = None
report = {'status': 'failed', 'publicFilesWritten': 0, 'databaseWrites': 0, 'envModified': False}
code = 1
admin_mode = sys.argv[1:] == ['--admin']
target = 'rf017-admin-init.php' if admin_mode else 'rf017-db-preflight.phar'
try:
    if sys.argv[1:] and not admin_mode:
        raise setup.SetupError('MODE_INVALID')
    if (os.environ.get('FTP_SERVER') != 'solu36.tuwebdns.net' or os.environ.get('FTP_PORT') != '21'
            or os.environ.get('PRIVATE_USER') != 'lb-api@linderosbarber.cl' or not os.environ.get('PRIVATE_PASSWORD')):
        raise setup.SetupError('CONFIGURATION_INVALID')
    payload = Path('tools/refactor/hosting/admin-init.php' if admin_mode else '.refactor-data/rf017-db-preflight.phar').read_bytes()
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    ftp = ftplib.FTP_TLS(context=context, timeout=25)
    ftp.connect('solu36.tuwebdns.net', 21)
    ftp.auth()
    ftp.login(os.environ['PRIVATE_USER'], os.environ['PRIVATE_PASSWORD'])
    ftp.prot_p()
    if ftp.pwd().rstrip('/') not in ('', '/home/leakmcl/apps/linderosbarber-php'):
        raise setup.SetupError('ROOT_UNEXPECTED')
    if target in setup.entries(ftp):
        raise setup.SetupError('DIAGNOSTIC_EXISTS_NOT_OVERWRITTEN')
    setup.upload_verified(ftp, target, payload, '600')
    report.update(status='uploaded-awaiting-cron', diagnosticUploaded=True, readBackVerified=True)
    code = 0
except setup.SetupError as error:
    report['code'] = str(error)
except Exception:
    report['code'] = 'DIAGNOSTIC_UPLOAD_FAILED'
finally:
    if ftp is not None:
        ftp.close()
Path('admin-init-upload-result.json' if admin_mode else 'db-preflight-upload-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
raise SystemExit(code)
