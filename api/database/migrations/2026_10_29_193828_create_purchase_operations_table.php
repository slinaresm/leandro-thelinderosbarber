<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_operations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('id', 64)->collation('ascii_bin')->primary();
            $table->char('payload_hash', 64)->collation('ascii_bin');
            $table->string('purchase_id', 191)->charset('ascii')->collation('ascii_bin')->nullable();
            $table->foreign('purchase_id')->references('id')->on('purchases')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new LogicException('Reversión destructiva deshabilitada; conservar claves y compras.');
    }
};
