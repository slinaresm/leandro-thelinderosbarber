<?php

use App\Database\DatabaseProfile;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = __DIR__;
$lock = fopen($root.'/rf017-api-install.lock', 'c');
if (! flock($lock, LOCK_EX | LOCK_NB)) {
    echo json_encode(['status' => 'installation-running']).PHP_EOL;
    exit;
}
$receipt = $root.'/rf017-api-install-result.json';
if (is_file($receipt)) {
    echo file_get_contents($receipt).PHP_EOL;
    exit;
}
$report = ['status' => 'failed', 'scope' => 'private-api-first-install', 'publicFilesWritten' => 0, 'providersEnabled' => false];
try {
    $manifest = json_decode(file_get_contents($root.'/release-api.json'), true, flags: JSON_THROW_ON_ERROR);
    if (($manifest['format'] ?? '') !== 'private-api-release-v1' || empty($manifest['files'])) {
        throw new RuntimeException('RELEASE_INVALID');
    }
    foreach ($manifest['files'] as $relative => $hash) {
        if (! preg_match('~^(api/|database/|rf017-api-init\.php$)~D', $relative) || str_contains($relative, '..') || str_contains($relative, '\\')
            || preg_match('~(^|/)(\.env|storage|uploads)(/|$)~', $relative)
            || ! is_file($root.'/'.$relative) || is_link($root.'/'.$relative)
            || ! hash_equals($hash, hash_file('sha256', $root.'/'.$relative))) {
            throw new RuntimeException('RELEASE_INVALID');
        }
    }
    foreach (['api/storage/app', 'api/storage/logs', 'api/storage/framework/cache/data', 'api/storage/framework/sessions', 'api/storage/framework/views', 'api/bootstrap/cache'] as $directory) {
        if (! is_dir($root.'/'.$directory)) {
            mkdir($root.'/'.$directory, 0700, true);
        }
    }
    $data = '/home/leakmcl/apps/linderosbarber-data';
    foreach ([$data, $data.'/photos', $data.'/catalog', $data.'/invoices'] as $directory) {
        if (is_link($directory)) {
            throw new RuntimeException('UNSAFE_DATA_ROOT');
        }
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }
    }
    require $root.'/api/vendor/autoload.php';
    $app = require $root.'/api/bootstrap/app.php';
    $kernel = $app->make(Kernel::class);
    $kernel->bootstrap();
    if (config('database.default') !== 'mariadb' || config('database.connections.mariadb.database') !== 'leakmcl_linderos'
        || config('database.connections.mariadb.username') !== 'leakmcl_linderos_usr'
        || config('app.env') !== 'production' || config('app.debug') !== false
        || config('jwt.origin') !== 'https://linderosbarber.cl'
        || config('app.hosting_public_root') !== '/home/leakmcl/public_html/linderosbarber.cl') {
        throw new RuntimeException('INSTALL_CONFIGURATION_INVALID');
    }
    if ($kernel->call('down') !== 0) {
        throw new RuntimeException('MAINTENANCE_REQUIRED');
    }
    DatabaseProfile::assertSupported();
    $count = (int) DB::selectOne('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->n;
    if ($count !== 0) {
        throw new RuntimeException('DATABASE_NOT_EMPTY');
    }
    $kernel->call('operations:run', ['action' => 'check']);
    $before = json_decode(trim($kernel->output()), true, flags: JSON_THROW_ON_ERROR);
    foreach ($before['checks'] as $name => $passed) {
        if ($name !== 'schema' && $passed !== true) {
            throw new RuntimeException('PREFLIGHT_FAILED');
        }
    }
    if ($kernel->call('migrate', ['--force' => true, '--no-interaction' => true]) !== 0) {
        throw new RuntimeException('MIGRATION_FAILED');
    }
    if ($kernel->call('operations:run', ['action' => 'check']) !== 0) {
        throw new RuntimeException('POST_INSTALL_CHECK_FAILED');
    }
    $after = json_decode(trim($kernel->output()), true, flags: JSON_THROW_ON_ERROR);
    $report += ['tables' => (int) DB::selectOne('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->n, 'checks' => $after['checks'], 'maintenanceActive' => app()->isDownForMaintenance()];
    $report['status'] = 'passed';
    file_put_contents($receipt, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    chmod($receipt, 0600);
} catch (Throwable $error) {
    $allowed = ['RELEASE_INVALID', 'UNSAFE_DATA_ROOT', 'INSTALL_CONFIGURATION_INVALID', 'MAINTENANCE_REQUIRED', 'DATABASE_NOT_EMPTY', 'PREFLIGHT_FAILED', 'MIGRATION_FAILED', 'POST_INSTALL_CHECK_FAILED'];
    $report['code'] = $error instanceof RuntimeException && in_array($error->getMessage(), $allowed, true) ? $error->getMessage() : 'API_INSTALL_FAILED';
}
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($report['status'] === 'passed' ? 0 : 1);
