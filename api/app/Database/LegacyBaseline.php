<?php

namespace App\Database;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LegacyBaseline
{
    public function apply(): void
    {
        $db = DB::connection();
        DatabaseProfile::assertSupported();
        $lock = $db->selectOne("SELECT GET_LOCK(CONCAT(DATABASE(), ':rf003'), 10) AS acquired");
        if ((int) $lock->acquired !== 1) {
            throw new \RuntimeException('Migración ocupada.');
        }
        try {
            $sql = file_get_contents(DatabaseProfile::baseline());
            $checksum = hash('sha256', $sql);
            $db->statement('CREATE TABLE IF NOT EXISTS refactor_schema_migrations (version VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, checksum CHAR(64) CHARACTER SET ascii NOT NULL, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB');
            $existing = $db->table('refactor_schema_migrations')->where('version', '001_legacy_baseline.sql')->first();
            if ($existing && ! hash_equals($existing->checksum, $checksum)) {
                throw new \RuntimeException('Checksum baseline incompatible.');
            }
            if (! $existing) {
                foreach (array_filter(array_map('trim', explode(';', preg_replace('/^--.*$/m', '', $sql)))) as $statement) {
                    $db->statement($statement);
                }
            }
            $this->verify();
            if (! $existing) {
                $db->table('refactor_schema_migrations')->insert(['version' => '001_legacy_baseline.sql', 'checksum' => $checksum]);
            }
        } finally {
            $db->select("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':rf003'))");
        }
    }

    public function verify(): void
    {
        $manifest = json_decode(file_get_contents(base_path('../database/mysql/schema-manifest.json')), true, flags: JSON_THROW_ON_ERROR);
        $types = ['integer' => 'bigint', 'id' => 'varchar', 'key' => 'varchar', 'email' => 'varchar', 'enum' => 'varchar', 'text' => 'longtext', 'json' => 'json', 'date' => 'date', 'time' => 'time', 'instant' => 'datetime'];
        if (DatabaseProfile::engine() === 'mariadb') {
            $types['json'] = 'longtext';
        }
        foreach ($manifest as $table => $expected) {
            $columns = collect(Schema::getColumns($table))->keyBy('name');
            if ($columns->count() !== count($expected)) {
                throw new \RuntimeException('Estructura baseline incompatible.');
            }
            $foreignKeys = Schema::getForeignKeys($table);
            $indexes = Schema::getIndexes($table);
            foreach ($expected as $name => $field) {
                $column = $columns->get($name);
                if ($field['kind'] === 'json' && DatabaseProfile::engine() === 'mariadb') {
                    $checks = DB::select('SELECT CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=?', [$table]);
                    if (! collect($checks)->contains(fn (object $check): bool => preg_match('/json_valid\s*\(\s*`?'.preg_quote($name, '/').'`?\s*\)/i', $check->clause) === 1)) {
                        throw new \RuntimeException('Restricción JSON incompatible.');
                    }
                }
                if (! $column || $column['type_name'] !== $types[$field['kind']] || $column['nullable'] !== $field['nullable']) {
                    throw new \RuntimeException('Columna baseline incompatible.');
                }
                if (isset($field['references']) && ! collect($foreignKeys)->contains(fn (array $key): bool => $key['columns'] === [$name] && $key['foreign_table'] === $field['references'] && strtoupper($key['on_delete']) === $field['onDelete'])) {
                    throw new \RuntimeException('Relación baseline incompatible.');
                }
                if (($name === 'id' || ($field['unique'] ?? false)) && ! collect($indexes)->contains(fn (array $index): bool => $index['columns'] === [$name] && $index['unique'])) {
                    throw new \RuntimeException('Índice baseline incompatible.');
                }
            }
        }
    }
}
