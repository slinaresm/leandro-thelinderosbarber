import base64
import ftplib
import hashlib
import hmac
import http.cookiejar
import io
import json
import os
from pathlib import Path
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


report = {'scope': 'admin-maintenance-http-diagnostic', 'passwordRead': False, 'maintenanceChanged': False}
ftp = None
try:
    if os.environ.get('FTP_SERVER') != 'solu36.tuwebdns.net' or os.environ.get('PRIVATE_USER') != 'lb-api@linderosbarber.cl':
        raise ValueError('configuration')
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=25)
    ftp.connect('solu36.tuwebdns.net', 21)
    ftp.auth()
    ftp.login(os.environ['PRIVATE_USER'], os.environ['PRIVATE_PASSWORD'])
    ftp.prot_p()
    payload = io.BytesIO()
    ftp.retrbinary('RETR api/storage/framework/down', payload.write)
    data = json.loads(payload.getvalue())
    secret = data.get('secret')
    report['bypassConfigured'] = isinstance(secret, str) and secret.startswith('api/rf017-admin-')
    if not report['bypassConfigured']:
        raise ValueError('maintenance')
    expires = int(time.time()) + 300
    cookie = base64.b64encode(json.dumps({'expires_at': expires, 'mac': hmac.new(secret.encode(), str(expires).encode(), hashlib.sha256).hexdigest()}, separators=(',', ':')).encode()).decode()
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(jar))

    def request(path, manual=False):
        headers = {'Origin': 'https://linderosbarber.cl', 'Accept': 'application/json'}
        if manual:
            headers['Cookie'] = 'laravel_maintenance=' + urllib.parse.quote(cookie, safe='')
        req = urllib.request.Request('https://linderosbarber.cl' + path, headers=headers)
        try:
            response = opener.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        try:
            parsed = json.loads(body)
        except ValueError:
            parsed = {}
        return {'status': response.status, 'json': bool(parsed), 'error': parsed.get('error'), 'setsCookie': bool(response.headers.get('Set-Cookie'))}

    report['bypassRoute'] = request('/' + secret)
    report['csrfViaCookieJar'] = request('/api/auth/csrf')
    report['csrfViaSignedCookie'] = request('/api/auth/csrf', True)
    report['healthViaSignedCookie'] = request('/api/health', True)
    report['status'] = 'diagnostic-complete'
except Exception:
    report['status'] = 'diagnostic-failed'
finally:
    if ftp is not None:
        ftp.close()
Path('admin-http-probe.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
