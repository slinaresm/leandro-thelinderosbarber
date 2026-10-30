<?php

namespace App\Files;

use Illuminate\Support\Facades\DB;

class CatalogImages extends ImageFiles
{
    protected string $configKey = 'catalog';

    protected string $jobsTable = 'catalog_file_jobs';

    protected string $referencesTable = 'products';

    protected string $referenceColumn = 'image_url';

    protected string $urlPrefix = '/uploads/products/';

    protected string $legacyDirectory = 'products';

    public function root(string $disk): ?string
    {
        $root = parent::root($disk);
        if ($root !== null) {
            foreach ([config('invoices.root'), config('invoices.legacy_root') ? rtrim(config('invoices.legacy_root'), '/\\').DIRECTORY_SEPARATOR.'invoices' : null, config('photos.root'), config('photos.legacy_root') ? rtrim(config('photos.legacy_root'), '/\\').DIRECTORY_SEPARATOR.'haircuts' : null] as $private) {
                if (! is_string($private) || $private === '') {
                    continue;
                }
                $private = realpath($private) ?: $private;
                $left = $this->normalized($root);
                $right = $this->normalized($private);
                abort_if($left === $right || str_starts_with($left, $right.'/') || str_starts_with($right, $left.'/'), 503);
            }
        }

        return $root;
    }

    public function own(string $filename): void
    {
        $job = DB::table($this->jobsTable)->where('disk', 'managed')->where('filename', $filename)->lockForUpdate()->first();
        abort_unless($job && $job->state === 'staged', 409);
        DB::table($this->jobsTable)->where('id', $job->id)->update(['state' => 'owned']);
    }

    public function release(?string $url): void
    {
        if ($url === null || ! str_starts_with($url, $this->urlPrefix)) {
            return;
        }
        $name = substr($url, strlen($this->urlPrefix));
        abort_unless($this->validName($name), 409);
        $location = $this->locate($name);
        $known = DB::table($this->jobsTable)->where('filename', $name)->where('state', 'owned')->first();
        DB::table($this->jobsTable)->upsert([['filename' => $name, 'disk' => $location['disk'] ?? $known->disk ?? 'legacy', 'state' => 'delete', 'created_at' => now('UTC')->format('Y-m-d H:i:s.u')]], ['disk', 'filename'], ['state']);
    }
}
