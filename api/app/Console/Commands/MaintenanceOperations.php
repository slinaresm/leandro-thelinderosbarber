<?php

namespace App\Console\Commands;

use App\Agenda\ScheduledOperations;
use Illuminate\Console\Command;
use Throwable;

class MaintenanceOperations extends Command
{
    protected $signature = 'maintenance:run';

    protected $description = 'Purgar prefijo de eventos y limpiar archivos huérfanos con resultados persistidos';

    public function handle(ScheduledOperations $operations): int
    {
        try {
            $results = $operations->maintenance();
            $this->line(json_encode($results, JSON_THROW_ON_ERROR));

            return collect($results)->contains(fn (array $result): bool => $result['state'] === 'failed') ? self::FAILURE : self::SUCCESS;
        } catch (Throwable) {
            $this->error('maintenance_operation_failed');

            return self::FAILURE;
        }
    }
}
