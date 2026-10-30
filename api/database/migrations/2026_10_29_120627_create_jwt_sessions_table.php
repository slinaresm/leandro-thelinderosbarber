<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('jwt_sessions', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->string('jti', 64)->charset('ascii')->collation('ascii_bin')->primary();
            $table->string('user_id', 191)->charset('ascii')->collation('ascii_bin');
            $table->dateTime('expires_at', 6)->index();
            $table->dateTime('created_at', 6);
            $table->dateTime('revoked_at', 6)->nullable();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['user_id', 'expires_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jwt_sessions');
    }
};
