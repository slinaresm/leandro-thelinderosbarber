<?php

namespace App\Files;

use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvoiceFiles extends ImageFiles
{
    protected string $configKey = 'invoices';

    protected string $legacyDirectory = 'invoices';

    protected string $jobsTable = 'invoice_file_jobs';

    protected string $referencesTable = 'purchases';

    protected string $referenceColumn = 'invoice_file_url';

    protected string $urlPrefix = '/uploads/invoices/';

    /** @return array{filename:string,bytes:string} */
    public function prepare(UploadedFile $file): array
    {
        if (strtolower($file->getClientOriginalExtension()) !== 'pdf') {
            return parent::prepare($file);
        }
        abort_unless($file->isValid(), 400);
        abort_if($file->getSize() > self::MAX_BYTES, 413);
        abort_unless(preg_match('/^[\p{L}\p{N} _-]{1,100}\.pdf$/iuD', $file->getClientOriginalPath()) && $file->getClientMimeType() === 'application/pdf' && (new \finfo(FILEINFO_MIME_TYPE))->file($file->getPathname()) === 'application/pdf', 400);
        $bytes = file_get_contents($file->getPathname());
        abort_unless(is_string($bytes) && str_starts_with($bytes, '%PDF-') && str_ends_with(rtrim($bytes), '%%EOF'), 400);

        return ['filename' => (string) Str::uuid().'.pdf', 'bytes' => $bytes];
    }

    public function ownDraft(string $filename, string $actor, bool $simulated): string
    {
        return DB::transaction(function () use ($filename, $actor, $simulated): string {
            $job = DB::table($this->jobsTable)->where('disk', 'managed')->where('filename', $filename)->lockForUpdate()->first();
            abort_unless($job && $job->state === 'staged', 409);
            $expires = CarbonImmutable::parse($job->created_at, 'UTC')->addDay();
            abort_unless($expires->greaterThan(now('UTC')), 409);
            DB::table('invoice_drafts')->insert(['id' => (string) Str::uuid(), 'filename' => $filename, 'created_by' => $actor, 'simulated' => $simulated, 'expires_at' => $expires, 'created_at' => now('UTC')]);
            DB::table($this->jobsTable)->where('id', $job->id)->update(['state' => 'owned']);

            return $expires->toIso8601String();
        }, 3);
    }

    public function readableDraft(string $filename, string $actor): bool
    {
        return DB::table('invoice_drafts')->where('filename', $filename)->where('created_by', $actor)->whereNull('purchase_id')->where('expires_at', '>', now('UTC'))->exists();
    }

    public function claimDraft(string $url, string $actor, bool $reviewed): ?string
    {
        $filename = substr($url, strlen($this->urlPrefix));
        $job = DB::table($this->jobsTable)->where('disk', 'managed')->where('filename', $filename)->lockForUpdate()->first();
        $draft = DB::table('invoice_drafts')->where('filename', $filename)->lockForUpdate()->first();
        if (! $job && ! $draft) {
            return null;
        }
        abort_unless($job && $job->state === 'owned' && $draft, 404);
        abort_unless($draft->created_by === $actor, 403);
        abort_unless($reviewed, 400);
        abort_if($draft->purchase_id !== null || CarbonImmutable::parse($draft->expires_at, 'UTC')->lessThanOrEqualTo(now('UTC')), 409);

        return $draft->id;
    }

    public function consumeDraft(?string $id, string $purchase): void
    {
        if ($id !== null) {
            DB::table('invoice_drafts')->where('id', $id)->update(['purchase_id' => $purchase]);
        }
    }

    /** @return array{removed:int,retained:int} */
    public function cleanup(): array
    {
        $result = parent::cleanup();
        DB::table('invoice_drafts')->whereNull('purchase_id')->where('expires_at', '<=', now('UTC'))->whereNotExists(fn ($query) => $query->selectRaw('1')->from($this->jobsTable)->whereColumn('invoice_file_jobs.filename', 'invoice_drafts.filename'))->delete();

        return $result;
    }

    public function validName(string $name): bool
    {
        return preg_match('/^[A-Za-z0-9_-]{1,150}\.(?:jpg|jpeg|png|webp|pdf)$/D', $name) === 1;
    }

    public function root(string $disk): ?string
    {
        $root = parent::root($disk);
        if ($root === null) {
            return null;
        }
        foreach (['photos.root', 'catalog.root', 'photos.legacy_root', 'catalog.legacy_root'] as $key) {
            $other = config($key);
            if (! is_string($other) || $other === '') {
                continue;
            }
            if (str_ends_with($key, 'legacy_root')) {
                $other .= DIRECTORY_SEPARATOR.(str_starts_with($key, 'photos') ? 'haircuts' : 'products');
            }
            $other = realpath($other);
            if ($other) {
                $left = $this->normalized($root);
                $right = $this->normalized($other);
                abort_if($left === $right || str_starts_with($left, $right.'/') || str_starts_with($right, $left.'/'), 503);
            }
        }

        return $root;
    }

    /** @return array{path:string,mime:string} */
    public function document(string $url): array
    {
        abort_unless(str_starts_with($url, '/uploads/invoices/'), 400);
        $name = substr($url, strlen('/uploads/invoices/'));
        abort_unless($this->validName($name), 400);
        $file = $this->locate($name);
        abort_unless($file, 404);
        abort_if(filesize($file['path']) > self::MAX_BYTES, 413);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['path']);
        $expected = match (strtolower(pathinfo($name, PATHINFO_EXTENSION))) {
            'pdf' => 'application/pdf', 'jpg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'
        };
        abort_unless($mime === $expected, 404);
        if ($mime !== 'application/pdf') {
            abort_unless(@getimagesize($file['path']), 404);
        }

        return ['path' => $file['path'], 'mime' => $mime];
    }
}
