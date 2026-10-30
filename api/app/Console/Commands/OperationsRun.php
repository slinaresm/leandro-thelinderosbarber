<?php

namespace App\Console\Commands;

use App\Database\DatabaseProfile;
use App\Security\CsrfTokens;
use App\Security\JwtSessions;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class OperationsRun extends Command
{
    protected $signature = 'operations:run {action : check|backup|restore|compare} {path? : Directorio privado nuevo o copia existente} {--against= : Segunda copia para conciliación de retorno} {--writers-stopped} {--ack=} {--local : Solo ensayo, no valida entorno production}';

    protected $description = 'Comprobar hosting y respaldar/restaurar estado completo sin endpoints públicos';

    public function handle(): int
    {
        try {
            $action = $this->argument('action');
            $result = match ($action) {
                'check' => $this->readiness(),
                'backup' => $this->backup(),
                'restore' => $this->restore(),
                'compare' => $this->compare(),
                default => throw new RuntimeException('INVALID_ACTION'),
            };
            $this->line(json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return ($result['status'] ?? '') === 'passed' ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $error) {
            // Never print SQL, configuration, credentials or document paths.
            $code = $error instanceof RuntimeException && preg_match('/^[A-Z_]+$/D', $error->getMessage()) ? $error->getMessage() : 'OPERATIONS_FAILED';
            $this->line(json_encode(['status' => 'failed', 'code' => $code]));

            return self::FAILURE;
        }
    }

    private function requireCondition(bool $condition, string $code): void
    {
        if (! $condition) {
            throw new RuntimeException($code);
        }
    }

    private function schemaVersion(): string
    {
        $contents = file_get_contents(base_path('composer.lock'));
        $contents .= file_get_contents(base_path('../database/mysql/schema-manifest.json'));
        $contents .= file_get_contents(DatabaseProfile::baseline());
        foreach (glob(database_path('migrations/*.php')) as $file) {
            $contents .= basename($file).file_get_contents($file);
        }

        return hash('sha256', $contents);
    }

    /** @return array<string,string> */
    private function roots(): array
    {
        $publicRoot = config('app.hosting_public_root');
        $this->requireCondition(is_string($publicRoot) && is_dir($publicRoot) && ! is_link($publicRoot), 'PUBLIC_ROOT_REQUIRED');
        $roots = [];
        foreach (['photos' => 'haircuts', 'catalog' => 'products', 'invoices' => 'invoices'] as $config => $legacyDirectory) {
            foreach (['managed' => config($config.'.root'), 'legacy' => config($config.'.legacy_root') ? rtrim(config($config.'.legacy_root'), '/\\').'/'.$legacyDirectory : null] as $disk => $directory) {
                if (! $directory) {
                    continue;
                }
                $this->requireCondition(is_string($directory) && is_dir($directory) && ! is_link($directory), 'FILE_ROOT_UNAVAILABLE');
                $resolved = realpath($directory);
                $normalized = $this->normalized($resolved);
                foreach ([$publicRoot, public_path(), base_path('../frontend'), base_path('../web/public'), base_path('../web/build/client')] as $public) {
                    $public = $this->normalized(realpath($public) ?: $public);
                    $this->requireCondition(! $this->overlaps($normalized, $public), 'PUBLIC_FILE_ROOT');
                }
                foreach ($roots as $other) {
                    $this->requireCondition(! $this->overlaps($normalized, $this->normalized($other)), 'OVERLAPPING_FILE_ROOTS');
                }
                $roots[$config.'-'.$disk] = $resolved;
            }
        }

        return $roots;
    }

    private function normalized(string $path): string
    {
        $path = rtrim(str_replace('\\', '/', $path), '/');

        return PHP_OS_FAMILY === 'Windows' ? strtolower($path) : $path;
    }

    private function overlaps(string $left, string $right): bool
    {
        return $left === $right || str_starts_with($left, $right.'/') || str_starts_with($right, $left.'/');
    }

    /** @return array<string,mixed> */
    private function readiness(): array
    {
        $checks = ['php84' => PHP_VERSION_ID >= 80401 && PHP_VERSION_ID < 80500];
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'gd', 'curl'] as $extension) {
            $checks['extension_'.$extension] = extension_loaded($extension);
        }
        $checks['production'] = $this->option('local') || app()->environment('production');
        $checks['debug_off'] = config('app.debug') === false;
        $origin = config('jwt.origin');
        $url = is_string($origin) ? parse_url($origin) : false;
        $checks['origin_https'] = $url && ($url['scheme'] ?? '') === 'https' && isset($url['host']) && ! isset($url['user']) && ! isset($url['pass']) && ! isset($url['query']) && ! isset($url['fragment']) && ($url['path'] ?? '') === '';
        $checks['database_cache'] = config('cache.default') === 'database';
        try {
            app(JwtSessions::class)->keys();
            app(CsrfTokens::class)->assertConfigured();
            $checks['keys'] = true;
        } catch (Throwable) {
            $checks['keys'] = false;
        }
        try {
            $version = DB::selectOne('SELECT VERSION() AS version')->version;
            DatabaseProfile::assertSupported();
            $checks['database_version'] = true;
            $checks['collation'] = DB::selectOne('SELECT @@collation_database AS collation')->collation === DatabaseProfile::collation();
            $session = DB::selectOne('SELECT @@session.sql_mode AS modes, @@session.time_zone AS zone');
            $checks['strict_utc'] = str_contains($session->modes, 'STRICT_TRANS_TABLES') && $session->zone === '+00:00';
            $checks['schema'] = $this->hasCurrentSchema();
        } catch (Throwable) {
            $checks['database_version'] = false;
        }
        try {
            foreach ($this->roots() as $root) {
                $this->requireCondition(is_writable($root), 'FILE_ROOT_NOT_WRITABLE');
            }
            $checks['file_roots'] = true;
        } catch (Throwable) {
            $checks['file_roots'] = false;
        }
        $checks['runtime_writable'] = is_writable(storage_path()) && is_writable(base_path('bootstrap/cache'));

        return ['status' => in_array(false, $checks, true) ? 'failed' : 'passed', 'scope' => $this->option('local') ? 'local-only' : 'cli-configuration-only', 'checks' => $checks, 'pending' => ['https-http-smoke', 'cron-heartbeat', 'hosting-sse-capacity', 'external-providers']];
    }

    private function assertFrozen(): void
    {
        $this->requireCondition($this->option('writers-stopped') && app()->isDownForMaintenance(), 'MAINTENANCE_AND_DRAIN_REQUIRED');
    }

    private function hasCurrentSchema(): bool
    {
        $expected = ['migrations', 'refactor_schema_migrations', ...array_keys(json_decode(file_get_contents(base_path('../database/mysql/schema-manifest.json')), true, flags: JSON_THROW_ON_ERROR))];
        $migrations = [];
        foreach (glob(database_path('migrations/*.php')) as $file) {
            $migrations[] = basename($file, '.php');
            preg_match_all("/Schema::create\\(\\s*'([a-z_]+)'/", file_get_contents($file), $matches);
            $expected = [...$expected, ...$matches[1]];
        }
        $expected = array_values(array_unique($expected));
        sort($expected);
        sort($migrations);
        if ($this->tables() !== $expected) {
            return false;
        }
        $installed = DB::table('migrations')->orderBy('migration')->pluck('migration')->all();
        $engines = DB::select('SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\'');

        return $installed === $migrations
            && collect($engines)->every(fn (object $row) => strtoupper($row->engine) === 'INNODB')
            && DB::getSchemaBuilder()->hasColumn('reservations', 'notification_version')
            && DB::table('refactor_schema_migrations')->where('version', '001_legacy_baseline.sql')->value('checksum') === hash_file('sha256', DatabaseProfile::baseline());
    }

    /** @return array<string,string> */
    private function files(string $root): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::SELF_FIRST);
        foreach ($iterator as $entry) {
            $this->requireCondition(! $entry->isLink(), 'SYMLINK_REJECTED');
            if ($entry->isFile()) {
                $relative = str_replace('\\', '/', substr($entry->getPathname(), strlen($root) + 1));
                $files[$relative] = hash_file('sha256', $entry->getPathname());
            }
        }
        ksort($files);

        return $files;
    }

    /** @return list<string> */
    private function tables(): array
    {
        $tables = array_map(fn (object $row) => $row->name, DB::select('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\' ORDER BY TABLE_NAME'));
        foreach ($tables as $table) {
            $this->requireCondition((bool) preg_match('/^[A-Za-z0-9_]+$/D', $table), 'INVALID_TABLE_NAME');
        }
        sort($tables, SORT_STRING);

        return $tables;
    }

    /** @return array<string,array{rows:array,hash:string}> */
    private function snapshot(): array
    {
        $data = [];
        $bytes = 0;
        $this->requireCondition(DB::transactionLevel() === 0, 'TRANSACTION_ALREADY_ACTIVE');
        DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        DB::statement('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        try {
            foreach ($this->tables() as $table) {
                $rows = [];
                $offset = 0;
                $keys = DB::select('SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=\'PRIMARY\' ORDER BY SEQ_IN_INDEX', [$table]);
                $this->requireCondition($keys !== [], 'TABLE_PRIMARY_KEY_REQUIRED');
                do {
                    $query = DB::table($table);
                    foreach ($keys as $key) {
                        $query->orderBy($key->name);
                    }
                    $batch = $query->offset($offset)->limit(250)->get();
                    foreach ($batch as $row) {
                        $encoded = [];
                        foreach ((array) $row as $key => $value) {
                            $encoded[$key] = $value === null ? null : base64_encode((string) $value);
                        }
                        ksort($encoded);
                        $value = json_encode($encoded, JSON_THROW_ON_ERROR);
                        $bytes += strlen($value);
                        $this->requireCondition($bytes <= 67108864 && count($rows) < 100000, 'SNAPSHOT_LIMIT_EXCEEDED');
                        $rows[] = $value;
                    }
                    $offset += 250;
                } while ($batch->count() === 250);
                sort($rows, SORT_STRING);
                $data[$table] = ['rows' => $rows, 'hash' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR))];
            }
            DB::connection()->getPdo()->commit();
        } catch (Throwable $error) {
            DB::connection()->getPdo()->rollBack();
            throw $error;
        }

        return $data;
    }

    private function bundlePath(bool $new, ?string $input = null): string
    {
        $path = $input ?? $this->argument('path');
        $this->requireCondition(is_string($path) && $path !== '', 'BUNDLE_PATH_REQUIRED');
        if ($new) {
            $this->requireCondition(! file_exists($path) && is_dir(dirname($path)), 'BUNDLE_MUST_BE_NEW');
            $resolved = realpath(dirname($path)).DIRECTORY_SEPARATOR.basename($path);
        } else {
            $this->requireCondition(is_dir($path) && ! is_link($path), 'BUNDLE_UNAVAILABLE');
            $resolved = realpath($path);
        }
        foreach ([config('app.hosting_public_root'), public_path(), base_path('../frontend'), base_path('../web/public'), base_path('../web/build/client'), ...array_values($this->roots())] as $root) {
            $this->requireCondition(! $this->overlaps($this->normalized($resolved), $this->normalized(realpath($root) ?: $root)), 'UNSAFE_BUNDLE_PATH');
        }

        return $resolved;
    }

    /** @return array<string,mixed> */
    private function backup(): array
    {
        $this->assertFrozen();
        DatabaseProfile::assertSupported();
        $path = $this->bundlePath(true);
        $roots = $this->roots();
        $started = microtime(true);
        $data = $this->snapshot();
        $this->requireCondition(mkdir($path, 0700), 'BUNDLE_CREATE_FAILED');
        $manifest = ['format' => 'barber-full-backup-v1', 'schema' => $this->schemaVersion(), 'tables' => [], 'files' => []];
        $body = json_encode($data, JSON_THROW_ON_ERROR);
        $manifest['databaseHash'] = hash('sha256', $body);
        $this->requireCondition(file_put_contents($path.'/database.json', $body, LOCK_EX) === strlen($body), 'BUNDLE_WRITE_FAILED');
        foreach ($data as $table => $item) {
            $manifest['tables'][$table] = ['count' => count($item['rows']), 'hash' => $item['hash']];
        }
        foreach ($roots as $key => $root) {
            $manifest['files'][$key] = $this->files($root);
            foreach ($manifest['files'][$key] as $relative => $hash) {
                $target = $path.'/files/'.$key.'/'.$relative;
                if (! is_dir(dirname($target))) {
                    $this->requireCondition(mkdir(dirname($target), 0700, true), 'BUNDLE_CREATE_FAILED');
                }
                $this->requireCondition(copy($root.'/'.$relative, $target) && hash_file('sha256', $target) === $hash, 'FILE_COPY_FAILED');
            }
            $this->requireCondition($this->files($root) === $manifest['files'][$key], 'FILES_CHANGED_DURING_BACKUP');
        }
        $this->requireCondition($this->snapshot() === $data, 'DATABASE_CHANGED_DURING_BACKUP');
        $this->assertFrozen();
        $this->requireCondition(file_put_contents($path.'/manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT), LOCK_EX) !== false, 'BUNDLE_WRITE_FAILED');

        return ['status' => 'passed', 'tables' => $manifest['tables'], 'fileCount' => array_sum(array_map('count', $manifest['files'])), 'seconds' => round(microtime(true) - $started, 3)];
    }

    /** @return array<string,mixed> */
    private function compare(): array
    {
        $left = $this->verifiedManifest($this->bundlePath(false));
        $against = $this->option('against');
        $this->requireCondition(is_string($against) && $against !== '', 'SECOND_BUNDLE_REQUIRED');
        $right = $this->verifiedManifest($this->bundlePath(false, $against));
        $this->requireCondition($left['schema'] === $right['schema'] && array_keys($left['tables']) === array_keys($right['tables']), 'BACKUP_SCHEMA_MISMATCH');
        $changes = [];
        foreach ($left['tables'] as $table => $before) {
            if ($before['hash'] !== $right['tables'][$table]['hash']) {
                $changes[$table] = ['before' => $before['count'], 'after' => $right['tables'][$table]['count']];
            }
        }
        $fileChanges = $left['files'] !== $right['files'];
        $changed = $changes !== [] || $fileChanges;

        return ['status' => 'passed', 'postCutChanges' => $changed, 'tablesChanged' => $changes, 'filesChanged' => $fileChanges, 'legacyRollbackAllowed' => false, 'decision' => $changed ? 'blocked-preserve-new-state' : 'no-delta-human-review-required'];
    }

    /** @return array<string,mixed> */
    private function verifiedManifest(string $path): array
    {
        $this->requireCondition(is_file($path.'/manifest.json') && is_file($path.'/database.json'), 'BUNDLE_INCOMPLETE');
        $this->files($path);
        $manifest = json_decode(file_get_contents($path.'/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        $body = file_get_contents($path.'/database.json');
        $this->requireCondition(($manifest['format'] ?? '') === 'barber-full-backup-v1' && ($manifest['schema'] ?? '') === $this->schemaVersion(), 'BACKUP_SCHEMA_MISMATCH');
        $this->requireCondition(hash('sha256', $body) === ($manifest['databaseHash'] ?? ''), 'BACKUP_HASH_MISMATCH');
        $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        $this->requireCondition(array_keys($data) === array_keys($manifest['tables']), 'BACKUP_TABLE_SET_MISMATCH');
        foreach ($data as $table => $item) {
            $this->requireCondition(count($item['rows']) === $manifest['tables'][$table]['count'] && hash('sha256', json_encode($item['rows'], JSON_THROW_ON_ERROR)) === $manifest['tables'][$table]['hash'], 'TABLE_HASH_MISMATCH');
        }
        foreach ($manifest['files'] as $key => $files) {
            $this->requireCondition((bool) preg_match('/^(photos|catalog|invoices)-(managed|legacy)$/D', $key), 'INVALID_FILE_PATH');
            foreach ($files as $relative => $hash) {
                $this->requireCondition(! str_contains($relative, '\\') && ! str_starts_with($relative, '/') && ! in_array('..', explode('/', $relative), true), 'INVALID_FILE_PATH');
                $file = $path.'/files/'.$key.'/'.$relative;
                $this->requireCondition(is_file($file) && ! is_link($file) && str_starts_with(realpath($file), $path.DIRECTORY_SEPARATOR) && hash_file('sha256', $file) === $hash, 'FILE_HASH_MISMATCH');
            }
        }

        return $manifest;
    }

    /** @return array<string,mixed> */
    private function restore(): array
    {
        $this->assertFrozen();
        DatabaseProfile::assertSupported();
        $this->requireCondition($this->option('ack') === DB::connection()->getDatabaseName(), 'DATABASE_ACK_REQUIRED');
        $this->requireCondition($this->tables() === [], 'TARGET_NOT_EMPTY');
        $path = $this->bundlePath(false);
        $this->verifiedManifest($path);
        $this->requireCondition(is_file($path.'/manifest.json') && is_file($path.'/database.json'), 'BUNDLE_INCOMPLETE');
        $this->files($path); // Reject links anywhere in the bundle before reading it.
        $manifest = json_decode(file_get_contents($path.'/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        $this->requireCondition(($manifest['format'] ?? '') === 'barber-full-backup-v1' && ($manifest['schema'] ?? '') === $this->schemaVersion(), 'BACKUP_SCHEMA_MISMATCH');
        $body = file_get_contents($path.'/database.json');
        $this->requireCondition(hash('sha256', $body) === ($manifest['databaseHash'] ?? ''), 'BACKUP_HASH_MISMATCH');
        $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        $roots = $this->roots();
        $this->requireCondition(array_keys($roots) === array_keys($manifest['files']), 'FILE_ROOT_SET_MISMATCH');
        foreach ($roots as $key => $root) {
            $this->requireCondition($this->files($root) === [], 'FILE_TARGET_NOT_EMPTY');
            foreach ($manifest['files'][$key] as $relative => $hash) {
                $this->requireCondition(! str_contains($relative, '\\') && ! str_starts_with($relative, '/') && ! in_array('..', explode('/', $relative), true), 'INVALID_FILE_PATH');
                $source = $path.'/files/'.$key.'/'.$relative;
                $this->requireCondition(is_file($source) && ! is_link($source) && str_starts_with(realpath($source), $path.DIRECTORY_SEPARATOR) && hash_file('sha256', $source) === $hash, 'FILE_HASH_MISMATCH');
            }
        }
        $this->requireCondition($this->callSilent('migrate', ['--force' => true, '--no-interaction' => true]) === 0, 'RESTORE_MIGRATION_FAILED');
        $this->requireCondition($this->tables() === array_keys($data) && array_keys($data) === array_keys($manifest['tables']), 'BACKUP_TABLE_SET_MISMATCH');
        foreach ($this->tables() as $table) {
            $this->requireCondition(in_array($table, ['migrations', 'refactor_schema_migrations', 'event_clock'], true) || DB::table($table)->count() === 0, 'FRESH_SCHEMA_UNEXPECTED_DATA');
        }
        // Only code-owned schema is created. The backup never supplies executable DDL.
        $remaining = $this->tables();
        $dependencies = DB::select('SELECT TABLE_NAME AS child, REFERENCED_TABLE_NAME AS parent FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
        DB::transaction(function () use (&$remaining, $dependencies, $data, $manifest): void {
            DB::table('migrations')->delete(); // This target was empty before its fresh migrations.
            DB::table('event_clock')->delete();
            while ($remaining !== []) {
                $progress = false;
                foreach ($remaining as $index => $table) {
                    if (collect($dependencies)->contains(fn (object $key) => $key->child === $table && $key->parent !== $table && in_array($key->parent, $remaining, true))) {
                        continue;
                    }
                    $item = $data[$table];
                    $this->requireCondition(count($item['rows']) === $manifest['tables'][$table]['count'] && hash('sha256', json_encode($item['rows'], JSON_THROW_ON_ERROR)) === $manifest['tables'][$table]['hash'], 'TABLE_HASH_MISMATCH');
                    // Baseline's schema ledger may be populated by the migrations themselves.
                    if ($table === 'refactor_schema_migrations') {
                        DB::table($table)->delete();
                    }
                    foreach (array_chunk($item['rows'], 100) as $chunk) {
                        $rows = array_map(function (string $row): array {
                            $values = json_decode($row, true, 512, JSON_THROW_ON_ERROR);

                            return array_map(fn ($value) => $value === null ? null : base64_decode($value, true), $values);
                        }, $chunk);
                        DB::table($table)->insert($rows);
                    }
                    unset($remaining[$index]);
                    $progress = true;
                }
                $this->requireCondition($progress, 'CYCLIC_SCHEMA');
            }
        });
        $this->requireCondition($this->snapshot() === $data, 'RESTORE_RECONCILIATION_FAILED');
        foreach ($roots as $key => $root) {
            foreach ($manifest['files'][$key] as $relative => $hash) {
                $target = $root.'/'.$relative;
                if (! is_dir(dirname($target))) {
                    $this->requireCondition(mkdir(dirname($target), 0700, true), 'FILE_RESTORE_FAILED');
                }
                $this->requireCondition(copy($path.'/files/'.$key.'/'.$relative, $target) && hash_file('sha256', $target) === $hash, 'FILE_RESTORE_FAILED');
            }
            $this->requireCondition($this->files($root) === $manifest['files'][$key], 'FILE_RECONCILIATION_FAILED');
        }
        $revoked = DB::table('jwt_sessions')->whereNull('revoked_at')->update(['revoked_at' => now('UTC')]);
        DB::table('cache')->delete();
        DB::table('cache_locks')->delete();
        $this->assertFrozen();

        return ['status' => 'passed', 'reconciled' => true, 'tables' => $manifest['tables'], 'fileCount' => array_sum(array_map('count', $manifest['files'])), 'sessionsRevoked' => $revoked, 'cacheCleared' => true, 'maintenanceRetained' => app()->isDownForMaintenance()];
    }
}
