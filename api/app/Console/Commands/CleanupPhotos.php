<?php

namespace App\Console\Commands;

use App\Files\PrivatePhotos;
use Illuminate\Console\Command;

class CleanupPhotos extends Command
{
    protected $signature = 'photos:cleanup';

    protected $description = 'Limpiar hasta cien trabajos privados sin referencias activas; conservar fallos para reintento';

    public function handle(PrivatePhotos $files): int
    {
        $result = $files->cleanup();
        $this->info('Trabajos completados: '.$result['removed'].'; retenidos: '.$result['retained']);

        return $result['retained'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
