<?php

$root = dirname(__DIR__, 3);
$output = $argv[1] ?? $root.'/.refactor-data/rf017-db-preflight.phar';
if (file_exists($output)) {
    throw new RuntimeException('El destino del diagnóstico ya existe.');
}
$archive = new Phar($output);
$archive->startBuffering();
$archive->addFile(__DIR__.'/db-preflight.php', 'bootstrap.php');
foreach (['vlucas/phpdotenv', 'graham-campbell/result-type', 'phpoption/phpoption'] as $package) {
    $directory = $root.'/api/vendor/'.$package;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->isLink()) {
            throw new RuntimeException('No se admiten symlinks.');
        }
        if ($file->isFile()) {
            $archive->addFile($file->getPathname(), 'vendor/'.$package.'/'.str_replace('\\', '/', substr($file->getPathname(), strlen($directory) + 1)));
        }
    }
}
$archive->setStub('<?php if (PHP_SAPI !== "cli") { http_response_code(404); exit; } require "phar://".__FILE__."/bootstrap.php"; __HALT_COMPILER();');
$archive->setSignatureAlgorithm(Phar::SHA256);
$archive->stopBuffering();
echo "Diagnóstico empaquetado con el lector .env de la API; no contiene claves.\n";
