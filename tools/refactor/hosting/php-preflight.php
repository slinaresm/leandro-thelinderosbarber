<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$checks = ['php84' => PHP_VERSION_ID >= 80401 && PHP_VERSION_ID < 80500];
foreach (['ctype', 'curl', 'dom', 'fileinfo', 'filter', 'gd', 'hash', 'mbstring', 'openssl', 'pcre', 'pdo', 'pdo_mysql', 'session', 'tokenizer', 'xml'] as $extension) {
    $checks['extension_'.$extension] = extension_loaded($extension);
}
$report = [
    'scope' => 'hosting-php-cli-extensions-only',
    'status' => in_array(false, $checks, true) ? 'failed' : 'passed',
    'php' => PHP_VERSION,
    'checks' => $checks,
    'databaseConnectionVerified' => false,
    'applicationInstalledVerified' => false,
];
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($report['status'] === 'passed' ? 0 : 1);
