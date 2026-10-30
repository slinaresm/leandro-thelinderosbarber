<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('event_clock', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->unsignedBigInteger('sequence')->default(0);
        });
        DB::table('event_clock')->insert(['id' => 1, 'sequence' => 0]);
        Schema::create('agenda_events', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('kind', 32);
            foreach (['reservation_id', 'barber_id', 'client_user_id', 'barber_user_id'] as $column) {
                $table->string($column, 191)->charset('ascii')->collation('ascii_bin')->nullable();
            }
            $table->date('date')->nullable();
            $table->date('previous_date')->nullable();
            $table->dateTime('created_at', 6)->index();
            $table->index(['barber_id', 'id']);
            $table->index(['client_user_id', 'id']);
            $table->index(['barber_user_id', 'id']);
        });
    }

    public function down(): void
    {
        throw new LogicException('No eliminar historial de eventos automáticamente.');
    }
};
