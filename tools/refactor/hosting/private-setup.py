"""Provisiona solo configuración nueva y diagnóstico en la raíz FTPS privada."""
import base64
import ftplib
import io
import json
import os
from pathlib import Path
import secrets
import ssl


class SetupError(Exception):
    pass


def new_environment(template):
    if 'DB_PASSWORD=\n' not in template or 'DB_CONNECTION=mariadb\n' not in template:
        raise SetupError('TEMPLATE_INVALID')
    app_key = base64.b64encode(secrets.token_bytes(32)).decode('ascii')
    jwt_key = base64.b64encode(secrets.token_bytes(48)).decode('ascii')
    return template.replace('APP_KEY=\n', 'APP_KEY=base64:' + app_key + '\n').replace(
        'JWT_KEYS={}\n', "JWT_KEYS='" + json.dumps({'key-1': jwt_key}, separators=(',', ':')) + "'\n")


def entries(ftp):
    return {name: facts for name, facts in ftp.mlsd() if name not in ('.', '..')}


def directory(ftp, name):
    current = entries(ftp)
    if name in current:
        if current[name].get('type') != 'dir':
            raise SetupError('UNSAFE_DIRECTORY')
    else:
        ftp.mkd(name)
    ftp.cwd(name)


def upload_verified(ftp, name, payload, permissions):
    ftp.storbinary('STOR ' + name, io.BytesIO(payload))
    ftp.sendcmd('SITE CHMOD ' + permissions + ' ' + name)
    received = io.BytesIO()
    ftp.retrbinary('RETR ' + name, received.write)
    if received.getvalue() != payload:
        raise SetupError('UPLOAD_VERIFICATION_FAILED')


def provision(ftp, environment, preflight):
    if ftp.pwd().rstrip('/') not in ('', '/home/leakmcl/apps/linderosbarber-php'):
        raise SetupError('ROOT_UNEXPECTED')
    directory(ftp, 'api')
    if '.env' in entries(ftp):
        raise SetupError('ENV_EXISTS_NOT_OVERWRITTEN')
    ftp.cwd('..')
    if 'rf017-preflight.php' in entries(ftp):
        raise SetupError('PREFLIGHT_EXISTS_NOT_OVERWRITTEN')
    upload_verified(ftp, 'rf017-preflight.php', preflight, '600')
    ftp.cwd('api')
    upload_verified(ftp, '.env', environment.encode('utf-8'), '600')
    return {'status': 'prepared-db-password-pending', 'privateEnvironmentUploaded': True,
            'freshApplicationKeysGenerated': True, 'preflightUploaded': True,
            'readBackVerified': True, 'permissionsRequested': '600',
            'databasePasswordConfigured': False, 'extensionsExecuted': False,
            'publicFilesWritten': 0, 'filesDeleted': 0}


def main():
    ftp = None
    report = {'status': 'failed', 'publicFilesWritten': 0, 'filesDeleted': 0}
    code = 1
    try:
        if (os.environ.get('FTP_SERVER') != 'solu36.tuwebdns.net'
                or os.environ.get('FTP_PORT') != '21'
                or os.environ.get('PRIVATE_USER') != 'lb-api@linderosbarber.cl'
                or not os.environ.get('PRIVATE_PASSWORD')):
            raise SetupError('CONFIGURATION_INVALID')
        root = Path(__file__).resolve().parents[3]
        template = (root / 'docs/refactor/hosting/production.env.example').read_text(encoding='utf-8')
        environment = new_environment(template)
        preflight = (root / 'tools/refactor/hosting/php-preflight.php').read_bytes()
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        ftp = ftplib.FTP_TLS(context=context, timeout=25)
        ftp.connect('solu36.tuwebdns.net', 21)
        ftp.auth()
        ftp.login(os.environ['PRIVATE_USER'], os.environ['PRIVATE_PASSWORD'])
        ftp.prot_p()
        report = provision(ftp, environment, preflight)
        code = 0
    except SetupError as error:
        report['code'] = str(error)
    except ssl.SSLCertVerificationError:
        report['code'] = 'TLS_CERTIFICATE_INVALID'
    except Exception:
        # No imprimir respuestas FTP, entorno ni datos privados.
        report['code'] = 'PRIVATE_SETUP_FAILED'
    finally:
        if ftp is not None:
            ftp.close()
    Path('private-setup-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
