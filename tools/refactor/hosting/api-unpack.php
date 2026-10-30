<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$root = __DIR__;
$lock = fopen($root.'/rf017-api-unpack.lock', 'c');
if (! flock($lock, LOCK_EX | LOCK_NB)) {
    echo json_encode(['status' => 'installation-running']).PHP_EOL;
    exit;
}
try {
    if (! is_file($root.'/rf017-api-unpacked.json')) {
        $archive = $root.'/rf017-private-api.tar';
        $expected = trim(file_get_contents($root.'/rf017-private-api.sha256'));
        if (! preg_match('/^[a-f0-9]{64}$/D', $expected) || ! hash_equals($expected, hash_file('sha256', $archive))) {
            throw new RuntimeException('ARCHIVE_HASH_INVALID');
        }
        $input = fopen($archive, 'rb');
        try {
            while (($header = fread($input, 512)) !== '' && $header !== str_repeat("\0", 512)) {
                $name = rtrim(substr($header, 0, 100), "\0");
                $parent = rtrim(substr($header, 345, 155), "\0");
                $name = ($parent === '' ? '' : $parent.'/').$name;
                $size = octdec(trim(substr($header, 124, 12), " \0"));
                if (strlen($header) !== 512 || substr($header, 257, 5) !== 'ustar'
                    || ! in_array($header[156], ['0', "\0"], true)
                    || ! preg_match('~^(api/|database/|rf017-api-init\.php$|release-api\.json$)~D', $name)
                    || str_contains($name, '..') || str_contains($name, '\\')
                    || preg_match('~(^|/)(\.env|storage|uploads)(/|$)~', $name)
                    || $size > filesize($archive) - ftell($input)
                    || fseek($input, (int) (ceil($size / 512) * 512), SEEK_CUR) !== 0) {
                    throw new RuntimeException('ARCHIVE_PATH_INVALID');
                }
            }
        } finally {
            fclose($input);
        }
        $tar = new PharData($archive);
        $prefix = 'phar://'.str_replace('\\', '/', $archive).'/';
        $files = [];
        foreach (new RecursiveIteratorIterator($tar) as $file) {
            $source = str_replace('\\', '/', $file->getPathname());
            $relative = substr($source, strlen($prefix));
            if (! str_starts_with($source, $prefix) || $file->isLink() || ! $file->isFile()
                || ! preg_match('~^(api/|database/|rf017-api-init\.php$|release-api\.json$)~D', $relative)
                || str_contains($relative, '..') || str_contains($relative, '\\')
                || preg_match('~(^|/)(\.env|storage|uploads)(/|$)~', $relative)) {
                throw new RuntimeException('ARCHIVE_PATH_INVALID');
            }
            $files[$relative] = $source;
        }
        foreach ($files as $relative => $source) {
            $parent = $root;
            foreach (explode('/', dirname($relative)) as $part) {
                if ($part === '.') {
                    continue;
                }
                $parent .= '/'.$part;
                if (is_link($parent) || (file_exists($parent) && ! is_dir($parent))) {
                    throw new RuntimeException('ARCHIVE_PATH_INVALID');
                }
                if (! is_dir($parent)) {
                    mkdir($parent, 0700);
                }
            }
            if (is_link($root.'/'.$relative) || ! copy($source, $root.'/'.$relative)) {
                throw new RuntimeException('ARCHIVE_COPY_FAILED');
            }
        }
        file_put_contents($root.'/rf017-api-unpacked.json', json_encode(['archiveSha256' => $expected, 'files' => count($files)]), LOCK_EX);
        chmod($root.'/rf017-api-unpacked.json', 0600);
    }
} catch (Throwable $error) {
    $allowed = ['ARCHIVE_HASH_INVALID', 'ARCHIVE_PATH_INVALID', 'ARCHIVE_COPY_FAILED'];
    $code = $error instanceof RuntimeException && in_array($error->getMessage(), $allowed, true) ? $error->getMessage() : 'ARCHIVE_UNPACK_FAILED';
    echo json_encode(['status' => 'failed', 'code' => $code, 'publicFilesWritten' => 0]).PHP_EOL;
    exit(1);
}
require $root.'/rf017-api-init.php';
