<?php

namespace App\Agenda;

use App\Events\EventRetention;
use App\Files\CatalogImages;
use App\Files\InvoiceFiles;
use App\Files\PrivatePhotos;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class ScheduledOperations
{
    /** @return array<string,mixed> */
    public function run(string $task, Closure $operation): array
    {
        $id = (string) Str::uuid();
        DB::table('maintenance_runs')->insert(['id' => $id, 'task' => $task, 'state' => 'running', 'started_at' => now('UTC')]);
        try {
            $metrics = $operation();
            $failed = ($metrics['retained'] ?? 0) > 0 || ($metrics['invalid'] ?? 0) > 0 || ($metrics['failed'] ?? 0) > 0 || ($metrics['unavailable'] ?? 0) > 0 || ($metrics['uncertain'] ?? 0) > 0;
            $state = $failed ? 'failed' : 'completed';
            $code = $failed ? 'attention_required' : null;
        } catch (Throwable) {
            $metrics = [];
            $state = 'failed';
            $code = 'operation_failed';
        }
        DB::table('maintenance_runs')->where('id', $id)->update(['state' => $state, 'code' => $code, 'metrics' => json_encode($metrics, JSON_THROW_ON_ERROR), 'finished_at' => now('UTC')]);

        return ['state' => $state, 'code' => $code, 'metrics' => $metrics];
    }

    /** @return array<string,array<string,mixed>> */
    public function maintenance(): array
    {
        return [
            'events' => $this->run('events.purge', fn (): array => ['removed' => app(EventRetention::class)->run()]),
            'photos' => $this->run('photos.cleanup', fn (): array => app(PrivatePhotos::class)->cleanup()),
            'invoices' => $this->run('invoices.cleanup', fn (): array => app(InvoiceFiles::class)->cleanup()),
            'catalog' => $this->run('catalog.cleanup', fn (): array => app(CatalogImages::class)->cleanup()),
        ];
    }
}
