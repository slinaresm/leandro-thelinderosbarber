<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_file_jobs', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->string('filename', 160)->collation('ascii_bin');
            $table->string('disk', 16);
            $table->string('state', 16);
            $table->dateTime('created_at', 6);
            $table->unique(['disk', 'filename']);
        });
        Schema::create('invoice_drafts', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->uuid('id')->primary();
            $table->string('filename', 160)->collation('ascii_bin')->unique();
            $table->string('created_by', 191)->charset('ascii')->collation('ascii_bin');
            $table->foreign('created_by')->references('id')->on('users')->cascadeOnDelete();
            $table->string('purchase_id', 191)->charset('ascii')->collation('ascii_bin')->nullable();
            $table->foreign('purchase_id')->references('id')->on('purchases')->restrictOnDelete();
            $table->boolean('simulated');
            $table->dateTime('expires_at', 6);
            $table->dateTime('created_at', 6);
        });
        Schema::create('ai_verifications', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('fingerprint', 64)->collation('ascii_bin')->primary();
            $table->string('source', 8);
            $table->dateTime('verified_at', 6);
            $table->dateTime('expires_at', 6);
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar borradores, archivos y verificación; reversión destructiva deshabilitada.');
    }
};
