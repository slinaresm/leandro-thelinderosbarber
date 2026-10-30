<?php

namespace App\Console\Commands;

use App\Commerce\GeminiGateway;
use Illuminate\Console\Command;
use Throwable;

class VerifyAi extends Command
{
    protected $signature = 'ai:verify {--live : Ejecutar dos consultas sintéticas con las credenciales configuradas}';

    protected $description = 'Verificar chat y extracción antes de habilitar Gemini; no imprime secretos';

    public function handle(GeminiGateway $gateway): int
    {
        if (! $this->option('live')) {
            $this->error('live_verification_required');

            return self::FAILURE;
        }
        try {
            $gateway->verify();
            $this->info(app()->environment('testing') ? 'test_verification_recorded_not_for_production' : 'live_verification_recorded');

            return self::SUCCESS;
        } catch (Throwable) {
            $this->error('ai_verification_failed');

            return self::FAILURE;
        }
    }
}
