<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('photo_file_jobs', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->string('filename', 180)->charset('ascii')->collation('ascii_bin');
            $table->string('disk', 16)->charset('ascii')->collation('ascii_bin');
            $table->string('state', 16)->charset('ascii')->collation('ascii_bin');
            $table->dateTime('created_at', 6);
            $table->unique(['disk', 'filename']);
            $table->index(['state', 'created_at']);
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar trabajos de archivos pendientes.');
    }
};
