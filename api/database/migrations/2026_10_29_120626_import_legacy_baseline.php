<?php

use App\Database\LegacyBaseline;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        app(LegacyBaseline::class)->apply();
    }

    public function down(): void
    {
        throw new RuntimeException('El baseline histórico no admite rollback destructivo.');
    }
};
