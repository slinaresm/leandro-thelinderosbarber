<?php

namespace App\Files;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class ImageFiles
{
    protected string $configKey = 'photos';

    protected string $jobsTable = 'photo_file_jobs';

    protected string $referencesTable = 'haircut_photos';

    protected string $referenceColumn = 'photo_url';

    protected string $urlPrefix = '/uploads/haircuts/';

    protected string $legacyDirectory = 'haircuts';

    public const MAX_BYTES = 8388608;

    public function validName(string $name): bool
    {
        return preg_match('/^[A-Za-z0-9_-]{1,150}\.(?:jpg|jpeg|png|webp)$/D', $name) === 1;
    }

    public function root(string $disk): ?string
    {
        abort_unless(in_array($disk, ['managed', 'legacy'], true), 400);
        $configured = $disk === 'managed' ? config($this->configKey.'.root') : config($this->configKey.'.legacy_root');
        if (! $configured && $disk === 'legacy') {
            return null;
        }
        abort_unless(is_string($configured) && $configured !== '', 503);
        $configured = $disk === 'legacy' ? rtrim($configured, '/\\').DIRECTORY_SEPARATOR.$this->legacyDirectory : $configured;
        if ($disk === 'managed' && ! is_dir($configured)) {
            abort_unless(@mkdir($configured, 0770, true) || is_dir($configured), 503);
        }
        $root = realpath($configured);
        abort_unless($root && is_dir($root) && ! is_link($configured), 503);
        $active = realpath(base_path('../backend'));
        abort_if($active && ($this->normalized($root) === $this->normalized($active) || str_starts_with($this->normalized($root), $this->normalized($active).'/')), 503);
        $public = realpath(public_path());
        abort_if($public && ($this->normalized($root) === $this->normalized($public) || str_starts_with($this->normalized($root), $this->normalized($public).'/')), 503);

        return $root;
    }

    protected function normalized(string $path): string
    {
        $path = rtrim(str_replace('\\', '/', $path), '/');

        return PHP_OS_FAMILY === 'Windows' ? strtolower($path) : $path;
    }

    public function path(string $disk, string $name): ?string
    {
        abort_unless($this->validName($name), 404);
        $root = $this->root($disk);
        if ($root === null) {
            return null;
        }
        $path = $root.DIRECTORY_SEPARATOR.$name;
        abort_if(is_link($path), 404);
        if (! file_exists($path)) {
            return null;
        }
        $real = realpath($path);
        abort_unless($real && is_file($real) && str_starts_with($this->normalized($real), $this->normalized($root).'/'), 404);

        return $real;
    }

    /** @return array{disk:string,path:string}|null */
    public function locate(string $name): ?array
    {
        $matches = [];
        foreach (['managed', 'legacy'] as $disk) {
            if ($path = $this->path($disk, $name)) {
                $matches[] = ['disk' => $disk, 'path' => $path];
            }
        }
        abort_if(count($matches) > 1, 409);

        return $matches[0] ?? null;
    }

    /** @return array{filename:string,bytes:string} */
    public function prepare(UploadedFile $file): array
    {
        abort_if(in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true), 413);
        abort_unless($file->isValid(), 400);
        abort_if($file->getSize() > self::MAX_BYTES, 413);
        $original = $file->getClientOriginalPath();
        abort_unless(preg_match('/^[\p{L}\p{N} _-]{1,100}\.(jpg|jpeg|png|webp)$/iuD', $original, $match), 400);
        $extension = strtolower($match[1]);
        $expected = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$extension];
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getPathname());
        $info = @getimagesize($file->getPathname());
        abort_unless($mime === $expected && $file->getClientMimeType() === $expected && $info && ($info['mime'] ?? null) === $expected, 400);
        abort_if($info[0] > 4096 || $info[1] > 4096 || $info[0] * $info[1] > 12000000, 400);
        abort_unless(function_exists('imagecreatefromstring'), 503);
        $image = @imagecreatefromstring(file_get_contents($file->getPathname()));
        abort_unless($image !== false, 400);
        ob_start();
        try {
            $success = match ($mime) {
                'image/jpeg' => imagejpeg($image, null, 90),
                'image/png' => imagepng($image, null, 6),
                'image/webp' => imagewebp($image, null, 90),
            };
            $bytes = ob_get_contents();
        } finally {
            ob_end_clean();
            unset($image);
        }
        abort_unless($success && is_string($bytes) && $bytes !== '', 400);
        abort_if(strlen($bytes) > self::MAX_BYTES, 413);

        return ['filename' => (string) Str::uuid().'.'.($extension === 'jpeg' ? 'jpg' : $extension), 'bytes' => $bytes];
    }

    /** @param array{filename:string,bytes:string} $prepared */
    public function stage(array $prepared): void
    {
        $name = $prepared['filename'];
        abort_unless($this->validName($name), 400);
        $root = $this->root('managed');
        abort_if($this->path('legacy', $name) !== null, 409);
        DB::table($this->jobsTable)->insert(['filename' => $name, 'disk' => 'managed', 'state' => 'staged', 'created_at' => now('UTC')->format('Y-m-d H:i:s.u')]);
        $stream = @fopen($root.DIRECTORY_SEPARATOR.$name, 'xb');
        if ($stream === false) {
            throw new RuntimeException('No se pudo guardar la imagen privada.');
        }
        try {
            $written = fwrite($stream, $prepared['bytes']);
            if ($written !== strlen($prepared['bytes']) || ! fflush($stream)) {
                throw new RuntimeException('Escritura incompleta de imagen privada.');
            }
        } finally {
            fclose($stream);
        }
    }

    public function deleteFile(string $disk, string $name): bool
    {
        if ($disk === 'legacy' && ! config($this->configKey.'.legacy_root')) {
            return false;
        }
        $path = $this->path($disk, $name);

        return $path === null || @unlink($path);
    }

    /** @return array{removed:int,retained:int} */
    public function cleanup(): array
    {
        $removed = 0;
        $retained = 0;
        $jobs = DB::table($this->jobsTable)->where(fn ($query) => $query->where('state', 'delete')->orWhere(fn ($query) => $query->whereIn('state', ['staged', 'owned'])->where('created_at', '<=', now('UTC')->subDay())))->whereNotExists(fn ($query) => $query->selectRaw('1')->from($this->referencesTable)->whereRaw("{$this->referencesTable}.{$this->referenceColumn} = CONCAT('{$this->urlPrefix}', {$this->jobsTable}.filename)"))->orderBy('id')->limit(100)->get();
        foreach ($jobs as $job) {
            try {
                $done = DB::transaction(function () use ($job): bool {
                    $current = DB::table($this->jobsTable)->where('id', $job->id)->lockForUpdate()->first();
                    if (! $current) {
                        return true;
                    }
                    if (! $this->validName($current->filename) || ! in_array($current->disk, ['managed', 'legacy'], true) || DB::table($this->referencesTable)->where($this->referenceColumn, $this->urlPrefix.$current->filename)->exists()) {
                        return false;
                    }
                    if (! $this->deleteFile($current->disk, $current->filename)) {
                        return false;
                    }
                    DB::table($this->jobsTable)->where('id', $current->id)->delete();

                    return true;
                }, 3);
                $done ? $removed++ : $retained++;
            } catch (\Throwable) {
                $retained++;
            }
        }

        return ['removed' => $removed, 'retained' => $retained];
    }
}
