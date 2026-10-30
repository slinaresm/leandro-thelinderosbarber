<?php

use App\Commerce\AuditTrail;
use GuzzleHttp\Cookie\SetCookie;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Http\MaintenanceModeBypassCookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
umask(0077);
$root = __DIR__;
$lock = fopen($root.'/rf017-admin.lock', 'c');
if (! flock($lock, LOCK_EX | LOCK_NB)) {
    echo json_encode(['status' => 'admin-creation-running']).PHP_EOL;
    exit;
}
$receipt = $root.'/rf017-admin-result.json';
if (is_file($receipt)) {
    echo file_get_contents($receipt).PHP_EOL;
    exit;
}
$report = ['status' => 'failed', 'scope' => 'initial-admin-creation', 'passwordDisclosed' => false];
$opened = false;
$kernel = null;
try {
    require $root.'/api/vendor/autoload.php';
    $app = require $root.'/api/bootstrap/app.php';
    $kernel = $app->make(Kernel::class);
    $kernel->bootstrap();
    if (config('database.default') !== 'mariadb' || config('database.connections.mariadb.database') !== 'leakmcl_linderos'
        || config('app.env') !== 'production' || config('app.debug') !== false
        || config('jwt.origin') !== 'https://linderosbarber.cl') {
        throw new RuntimeException('ADMIN_CONFIGURATION_INVALID');
    }
    if ($kernel->call('operations:run', ['action' => 'check']) !== 0) {
        throw new RuntimeException('READINESS_FAILED');
    }
    $accessFile = '/home/leakmcl/apps/linderosbarber-data/admin-access.json';
    if (is_link($accessFile)) {
        throw new RuntimeException('PRIVATE_ACCESS_FILE_INVALID');
    }
    $access = is_file($accessFile) ? json_decode(file_get_contents($accessFile), true, flags: JSON_THROW_ON_ERROR) : null;
    $email = 'admin@linderosbarber.cl';
    if ($access && (($access['email'] ?? '') !== $email || strlen($access['password'] ?? '') < 32)) {
        throw new RuntimeException('PRIVATE_ACCESS_FILE_INVALID');
    }
    $acquired = DB::selectOne("SELECT GET_LOCK(CONCAT(DATABASE(), ':rf017-admin'), 10) AS acquired");
    if ((int) $acquired->acquired !== 1) {
        throw new RuntimeException('ADMIN_CREATION_BUSY');
    }
    try {
        $user = DB::table('users')->where('email', $email)->first();
        if ($user) {
            if (! $access || $user->role !== 'admin' || $user->deleted_at !== null || ! password_verify($access['password'], $user->password_hash)) {
                throw new RuntimeException('EXISTING_ACCOUNT_NOT_OVERWRITTEN');
            }
        } else {
            if (DB::table('users')->exists()) {
                throw new RuntimeException('INITIAL_ADMIN_REQUIRES_EMPTY_USERS');
            }
            if (! $access) {
                $access = ['email' => $email, 'password' => bin2hex(random_bytes(16)).'!aA7', 'loginUrl' => 'https://linderosbarber.cl/ingresar'];
                $file = fopen($accessFile, 'x');
                if (! $file) {
                    throw new RuntimeException('PRIVATE_ACCESS_FILE_INVALID');
                }
                $bytes = json_encode($access, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
                if (fwrite($file, $bytes) !== strlen($bytes)) {
                    fclose($file);
                    throw new RuntimeException('PRIVATE_ACCESS_FILE_INVALID');
                }
                fclose($file);
                chmod($accessFile, 0600);
            }
            $id = (string) Str::uuid();
            DB::transaction(function () use ($id, $email, $access): void {
                DB::table('users')->insert(['id' => $id, 'name' => 'Administrador Linderos', 'email' => $email, 'password_hash' => password_hash($access['password'], PASSWORD_BCRYPT), 'role' => 'admin']);
                app(AuditTrail::class)->record($id, 'user', $id, 'bootstrap_admin', null, (object) ['role' => 'admin']);
            });
        }
    } finally {
        DB::select("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':rf017-admin'))");
    }
    $secret = 'api/rf017-admin-'.bin2hex(random_bytes(24));
    if ($kernel->call('down', ['--secret' => $secret]) !== 0) {
        throw new RuntimeException('MAINTENANCE_SETUP_FAILED');
    }
    $origin = 'https://linderosbarber.cl';
    $bypass = MaintenanceModeBypassCookie::create($secret);
    $cookieValues = ['laravel_maintenance' => rawurlencode($bypass->getValue())];
    $send = function (string $method, string $path, array $data = [], ?string $csrfToken = null) use ($origin, &$cookieValues) {
        $headers = ['Origin' => $origin, 'Accept' => 'application/json', 'User-Agent' => 'BarberLinderos-Setup/1.0', 'Cookie' => implode('; ', array_map(fn (string $name, string $value): string => $name.'='.$value, array_keys($cookieValues), $cookieValues))];
        if ($csrfToken !== null) {
            $headers['X-CSRF-Token'] = $csrfToken;
        }
        $response = Http::withHeaders($headers)->timeout(15)->withoutRedirecting()->send($method, $origin.$path, $method === 'POST' ? ['json' => $data] : []);
        foreach ($response->toPsrResponse()->getHeader('Set-Cookie') as $header) {
            $cookie = SetCookie::fromString($header);
            $name = $cookie->getName();
            if (! in_array($name, ['laravel_maintenance', 'bl_csrf', 'bl_session'], true)
                || ($cookie->getDomain() && ltrim($cookie->getDomain(), '.') !== 'linderosbarber.cl')
                || ($cookie->getPath() && $cookie->getPath() !== '/')) {
                continue;
            }
            if ($cookie->getMaxAge() === 0 || ($cookie->getExpires() && $cookie->getExpires() < time())) {
                unset($cookieValues[$name]);
            } else {
                $cookieValues[$name] = $cookie->getValue();
            }
        }

        return $response;
    };
    $report['stage'] = 'csrf';
    $csrf = $send('GET', '/api/auth/csrf');
    $report['httpChecks']['csrf'] = $csrf->status();
    if (! $csrf->ok() || ! is_string($csrf->json('csrfToken'))) {
        throw new RuntimeException('HTTP_LOGIN_CHECK_FAILED');
    }
    $report['stage'] = 'login';
    $login = $send('POST', '/api/auth/login', ['email' => $email, 'password' => $access['password']], $csrf->json('csrfToken'));
    $report['httpChecks']['login'] = $login->status();
    if (! $login->ok() || $login->json('user.role') !== 'admin') {
        throw new RuntimeException('HTTP_LOGIN_CHECK_FAILED');
    }
    $report['stage'] = 'session';
    $me = $send('GET', '/api/auth/me');
    $report['httpChecks']['session'] = $me->status();
    if (! $me->ok() || $me->json('user.role') !== 'admin') {
        throw new RuntimeException('HTTP_LOGIN_CHECK_FAILED');
    }
    $report['stage'] = 'roles';
    $admin = $send('GET', '/api/services/admin/all');
    $barber = $send('GET', '/api/barbers/me/profile');
    $report['httpChecks']['admin'] = $admin->status();
    $report['httpChecks']['barberDenied'] = $barber->status();
    if (! $admin->ok() || $barber->status() !== 403) {
        throw new RuntimeException('HTTP_LOGIN_CHECK_FAILED');
    }
    $report['stage'] = 'logout';
    $csrf = $send('GET', '/api/auth/csrf');
    $logout = $send('POST', '/api/auth/logout', [], $csrf->json('csrfToken'));
    $report['httpChecks']['logout'] = $logout->status();
    if ($logout->status() !== 204) {
        throw new RuntimeException('HTTP_LOGIN_CHECK_FAILED');
    }
    if ($kernel->call('up') !== 0) {
        throw new RuntimeException('API_OPEN_FAILED');
    }
    $opened = true;
    $report['stage'] = 'public-health';
    if (! $send('GET', '/api/health')->ok()) {
        throw new RuntimeException('PUBLIC_HEALTH_CHECK_FAILED');
    }
    $report += ['email' => $email, 'accessFile' => $accessFile, 'httpAdminLoginVerified' => true, 'adminRoleVerified' => true, 'publicHealthVerified' => true, 'maintenanceActive' => false];
    $report['status'] = 'passed';
    $report['stage'] = 'complete';
    file_put_contents($receipt, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    chmod($receipt, 0600);
} catch (Throwable $error) {
    if ($opened && $kernel) {
        $kernel->call('down');
    }
    $allowed = ['ADMIN_CONFIGURATION_INVALID', 'READINESS_FAILED', 'PRIVATE_ACCESS_FILE_INVALID', 'ADMIN_CREATION_BUSY', 'EXISTING_ACCOUNT_NOT_OVERWRITTEN', 'INITIAL_ADMIN_REQUIRES_EMPTY_USERS', 'MAINTENANCE_SETUP_FAILED', 'HTTP_LOGIN_CHECK_FAILED', 'API_OPEN_FAILED', 'PUBLIC_HEALTH_CHECK_FAILED'];
    $report['code'] = $error instanceof RuntimeException && in_array($error->getMessage(), $allowed, true) ? $error->getMessage() : 'ADMIN_CREATION_FAILED';
}
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($report['status'] === 'passed' ? 0 : 1);
