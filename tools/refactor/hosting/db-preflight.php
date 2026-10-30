<?php

spl_autoload_register(function (string $class): void {
    foreach (['Dotenv\\' => 'vlucas/phpdotenv/src/', 'GrahamCampbell\\ResultType\\' => 'graham-campbell/result-type/src/', 'PhpOption\\' => 'phpoption/phpoption/src/PhpOption/'] as $prefix => $directory) {
        if (str_starts_with($class, $prefix)) {
            require __DIR__.'/vendor/'.$directory.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';

            return;
        }
    }
});

$report = ['scope' => 'hosting-mariadb-read-only', 'status' => 'failed', 'businessRowsRead' => 0, 'persistentWrites' => 0, 'applicationSchemaVerified' => false];
$pdo = null;
try {
    $root = dirname(Phar::running(false));
    if (! is_file($root.'/api/.env')) {
        throw new RuntimeException('PRIVATE_ENV_MISSING');
    }
    $environment = Dotenv\Dotenv::parse(file_get_contents($root.'/api/.env'));
    if (($environment['DB_CONNECTION'] ?? '') !== 'mariadb'
        || ! in_array($environment['DB_HOST'] ?? '', ['localhost', '127.0.0.1'], true)
        || ($environment['DB_DATABASE'] ?? '') !== 'leakmcl_linderos'
        || ($environment['DB_USERNAME'] ?? '') !== 'leakmcl_linderos_usr'
        || empty($environment['DB_PASSWORD'])
        || ! ctype_digit($environment['DB_PORT'] ?? '3306')) {
        throw new RuntimeException('DATABASE_CONFIGURATION_INVALID');
    }
    $pdo = new PDO('mysql:host='.$environment['DB_HOST'].';port='.($environment['DB_PORT'] ?? '3306').';dbname='.$environment['DB_DATABASE'].';charset=utf8mb4', $environment['DB_USERNAME'], $environment['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10, PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo->exec('START TRANSACTION READ ONLY');
    $server = $pdo->query('SELECT VERSION() AS version, @@character_set_database AS charset, @@collation_database AS collation')->fetch(PDO::FETCH_ASSOC);
    $tables = (int) $pdo->query('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->fetchColumn();
    $pdo->rollBack();
    $checks = [
        'connection' => true,
        'mariadb106' => str_contains(strtolower($server['version']), 'mariadb') && preg_match('/^10\.6\.(\d+)/', $server['version'], $match) && (int) $match[1] >= 28,
        'database_utf8mb4' => $server['charset'] === 'utf8mb4',
        'database_collation' => $server['collation'] === 'utf8mb4_unicode_520_nopad_ci',
    ];
    $report += ['checks' => $checks, 'serverVersion' => $server['version'], 'databaseCharset' => $server['charset'], 'databaseCollation' => $server['collation'], 'tableCount' => $tables];
    $report['status'] = in_array(false, $checks, true) ? 'failed' : 'passed';
} catch (PDOException $error) {
    $number = (int) ($error->errorInfo[1] ?? 0);
    $report['code'] = match ($number) {
        1045 => 'DATABASE_AUTHENTICATION_FAILED',
        1049 => 'DATABASE_NOT_FOUND',
        2002, 2003 => 'DATABASE_HOST_UNAVAILABLE',
        default => 'DATABASE_CHECK_FAILED',
    };
} catch (Throwable $error) {
    $report['code'] = $error instanceof RuntimeException && in_array($error->getMessage(), ['PRIVATE_ENV_MISSING', 'DATABASE_CONFIGURATION_INVALID'], true) ? $error->getMessage() : 'PRIVATE_ENV_OR_RUNTIME_INVALID';
}
if ($pdo && $pdo->inTransaction()) {
    $pdo->rollBack();
}
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($report['status'] === 'passed' ? 0 : 1);
