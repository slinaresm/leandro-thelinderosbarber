<?php

namespace App\Console\Commands;

use App\Files\CatalogImages;
use Illuminate\Console\Command;

class CleanupCatalogImages extends Command
{
    protected $signature = 'catalog-images:cleanup';

    protected $description = 'Limpiar hasta cien imágenes comerciales sin referencias activas';

    public function handle(CatalogImages $images): int
    {
        $result = $images->cleanup();
        $this->info('Trabajos completados: '.$result['removed'].'; retenidos: '.$result['retained']);

        return $result['retained'] ? self::FAILURE : self::SUCCESS;
    }
}
