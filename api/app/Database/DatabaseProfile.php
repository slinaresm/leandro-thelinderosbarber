<?php

namespace App\Database;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class DatabaseProfile
{
    public static function engine(): string
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('DATABASE_PROFILE_UNSUPPORTED');
        }

        return $driver;
    }

    public static function assertSupported(): void
    {
        $version = DB::selectOne('SELECT VERSION() AS version')->version;
        $valid = self::engine() === 'mariadb'
            ? str_contains(strtolower($version), 'mariadb') && preg_match('/^10\.6\.(\d+)/', $version, $match) && (int) $match[1] >= 28
            : ! str_contains(strtolower($version), 'mariadb') && str_starts_with($version, '8.4.');
        if (! $valid) {
            throw new RuntimeException('DATABASE_VERSION_UNSUPPORTED');
        }
    }

    public static function collation(): string
    {
        return self::engine() === 'mariadb' ? 'utf8mb4_unicode_520_nopad_ci' : 'utf8mb4_0900_ai_ci';
    }

    public static function baseline(): string
    {
        return base_path('../database/'.self::engine().'/migrations/001_legacy_baseline.sql');
    }
}
