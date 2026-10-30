<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservations', function (Blueprint $table): void {
            $table->unsignedBigInteger('notification_version')->default(0);
        });
        Schema::create('notification_outbox', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('id', 64)->collation('ascii_bin')->primary();
            $table->string('user_id', 191)->charset('ascii')->collation('ascii_bin');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('reservation_id', 191)->charset('ascii')->collation('ascii_bin')->nullable()->index();
            $table->unsignedBigInteger('version')->default(0);
            $table->string('channel', 16);
            $table->string('type', 32);
            $table->json('payload');
            $table->string('state', 24)->default('queued');
            $table->unsignedInteger('attempts')->default(0);
            $table->dateTime('available_at', 6);
            $table->dateTime('expires_at', 6);
            $table->char('claim_token', 36)->nullable();
            $table->dateTime('lease_until', 6)->nullable();
            $table->string('error_code', 48)->nullable();
            $table->dateTime('created_at', 6);
            $table->dateTime('updated_at', 6);
            $table->index(['state', 'available_at']);
        });
        Schema::create('notification_attempts', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->uuid('id')->primary();
            $table->char('outbox_id', 64)->collation('ascii_bin');
            $table->foreign('outbox_id')->references('id')->on('notification_outbox')->cascadeOnDelete();
            $table->unsignedInteger('ordinal');
            $table->string('state', 24);
            $table->string('code', 48)->nullable();
            $table->dateTime('started_at', 6);
            $table->dateTime('finished_at', 6)->nullable();
            $table->unique(['outbox_id', 'ordinal']);
        });
        Schema::create('maintenance_runs', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->uuid('id')->primary();
            $table->string('task', 32)->index();
            $table->string('state', 16);
            $table->string('code', 48)->nullable();
            $table->json('metrics')->nullable();
            $table->dateTime('started_at', 6);
            $table->dateTime('finished_at', 6)->nullable();
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar outbox, intentos e historial; reversión destructiva deshabilitada.');
    }
};
