<?php

namespace App\Console\Commands;

use App\Agenda\NotificationWorker;
use App\Agenda\ReminderSweep;
use App\Agenda\ScheduledOperations;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class NotificationOperations extends Command
{
    protected $signature = 'notifications:run {action=tick : tick|sweep|work|status|retry} {--limit=100} {--id=}';

    protected $description = 'Operar avisos durables y consultar conteos sin datos privados';

    public function handle(NotificationWorker $worker, ReminderSweep $sweep, ScheduledOperations $operations): int
    {
        try {
            $action = $this->argument('action');
            $limit = $this->option('limit');
            if (! is_string($limit) || ! ctype_digit($limit) || (int) $limit < 1 || (int) $limit > 100) {
                $this->error('invalid_limit');

                return self::FAILURE;
            }
            if ($action === 'status') {
                $states = DB::table('notification_outbox')->selectRaw('state, COUNT(*) AS total')->groupBy('state')->pluck('total', 'state')->all();
                $runs = DB::table('maintenance_runs')->orderByDesc('started_at')->limit(10)->get(['task', 'state', 'code', 'started_at', 'finished_at', 'metrics']);
                $stalled = DB::table('maintenance_runs')->where('state', 'running')->where('started_at', '<', now('UTC')->subMinutes(30))->count();
                $this->line(json_encode(['states' => $states, 'stalledRuns' => $stalled, 'recentRuns' => $runs], JSON_THROW_ON_ERROR));

                return ($stalled || ($states['unavailable'] ?? 0) || ($states['failed'] ?? 0) || ($states['uncertain'] ?? 0) || $runs->contains('state', 'failed')) ? self::FAILURE : self::SUCCESS;
            }
            if ($action === 'retry') {
                $id = $this->option('id');
                $success = is_string($id) && preg_match('/^[a-f0-9]{64}$/D', $id) && $worker->retry($id);
                $this->line($success ? 'retry_queued' : 'retry_refused');

                return $success ? self::SUCCESS : self::FAILURE;
            }
            if (! in_array($action, ['tick', 'sweep', 'work'], true)) {
                $this->error('invalid_action');

                return self::FAILURE;
            }
            $results = [];
            if ($action !== 'work') {
                $results['sweep'] = $operations->run('notifications.sweep', fn (): array => $sweep->run());
            }
            if ($action !== 'sweep') {
                $results['work'] = $operations->run('notifications.work', fn (): array => $worker->run((int) $limit));
            }
            $this->line(json_encode($results, JSON_THROW_ON_ERROR));

            return collect($results)->contains(fn (array $result): bool => $result['state'] === 'failed') ? self::FAILURE : self::SUCCESS;
        } catch (Throwable) {
            $this->error('notification_operation_failed');

            return self::FAILURE;
        }
    }
}
