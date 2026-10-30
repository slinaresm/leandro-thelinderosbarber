<?php

namespace App\Agenda;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;
use Throwable;

class NotificationWorker
{
    public function __construct(private NotificationDelivery $delivery) {}

    /** @return array<string,int> */
    public function run(int $limit = 100): array
    {
        if (DB::transactionLevel() !== 0) {
            throw new LogicException('Worker requiere conexión fuera de la transacción HTTP.');
        }
        $limit = max(1, min(100, $limit));
        $recovered = $this->recover();
        $counts = $recovered > 0 ? ['uncertain' => $recovered] : [];
        for ($i = 0; $i < $limit; $i++) {
            $job = $this->claim();
            if ($job === null) {
                break;
            }
            if ($job->state === 'skipped') {
                $counts['skipped'] = ($counts['skipped'] ?? 0) + 1;

                continue;
            }
            try {
                $result = $this->delivery->send($job, $job->recipient);
            } catch (Throwable) {
                $result = ['state' => 'uncertain', 'code' => 'adapter_failure'];
            }
            if (! in_array($result['state'] ?? null, ['sent', 'simulated', 'unavailable', 'failed', 'retry', 'uncertain'], true) || ! in_array($result['code'] ?? null, ['simulation', 'channel_disabled', 'smtp_configuration', 'recipient_invalid', 'provider_accepted', 'smtp_outcome_unknown', 'channel_configuration', 'whatsapp_configuration', 'provider_rate_limited', 'provider_rejected', 'provider_outcome_unknown', 'adapter_failure'], true)) {
                $result = ['state' => 'uncertain', 'code' => 'adapter_failure'];
            }
            if ($result['state'] === 'retry' && $job->attempts >= 5) {
                $result = ['state' => 'failed', 'code' => 'retry_exhausted'];
            }
            $state = $this->finish($job, $result['state'], $result['code']);
            $counts[$state] = ($counts[$state] ?? 0) + 1;
        }

        return $counts;
    }

    public function recover(): int
    {
        $recovered = 0;
        foreach (DB::table('notification_outbox')->where('state', 'processing')->where('lease_until', '<=', now('UTC'))->limit(100)->pluck('id') as $id) {
            $recovered += DB::transaction(function () use ($id): int {
                $row = DB::table('notification_outbox')->where('id', $id)->lockForUpdate()->first();
                if ($row && $row->state === 'processing' && CarbonImmutable::parse($row->lease_until, 'UTC')->lessThanOrEqualTo(now('UTC'))) {
                    $this->save($row, 'uncertain', 'worker_interrupted');

                    return 1;
                }

                return 0;
            }, 3);
        }

        return $recovered;
    }

    private function claim(): ?object
    {
        return DB::transaction(function (): ?object {
            $row = DB::table('notification_outbox')->whereIn('state', ['queued', 'retry'])->where('available_at', '<=', now('UTC'))->orderBy('available_at')->orderBy('id')->lock('for update skip locked')->first();
            if (! $row) {
                return null;
            }
            $user = DB::table('users')->where('id', $row->user_id)->whereNull('deleted_at')->first();
            $valid = $user && CarbonImmutable::parse($row->expires_at, 'UTC')->greaterThan(now('UTC'));
            if ($valid && $row->reservation_id !== null) {
                $reservation = DB::table('reservations')->find($row->reservation_id);
                $valid = $reservation && (int) $reservation->notification_version === (int) $row->version && $reservation->status === ($row->type === 'cancelacion' ? 'cancelled' : 'confirmed');
                if ($valid && $row->type === 'recordatorio_24h') {
                    $valid = app(ReminderSweep::class)->instant($reservation)->timestamp - now('UTC')->timestamp > 7200;
                }
            }
            if (! $valid) {
                $this->save($row, 'skipped', 'obsolete_or_expired');
                $row->state = 'skipped';

                return $row;
            }
            if ($row->attempts >= 5) {
                $this->save($row, 'failed', 'retry_exhausted');
                $row->state = 'skipped';

                return $row;
            }
            $token = (string) Str::uuid();
            $attempt = (int) $row->attempts + 1;
            DB::table('notification_outbox')->where('id', $row->id)->update(['state' => 'processing', 'claim_token' => $token, 'attempts' => $attempt, 'lease_until' => now('UTC')->addMinutes(5), 'updated_at' => now('UTC')]);
            DB::table('notification_attempts')->insert(['id' => (string) Str::uuid(), 'outbox_id' => $row->id, 'ordinal' => $attempt, 'state' => 'started', 'started_at' => now('UTC')]);
            $row->claim_token = $token;
            $row->attempts = $attempt;
            $row->recipient = $user;

            return $row;
        }, 3);
    }

    private function finish(object $job, string $state, string $code): string
    {
        return DB::transaction(function () use ($job, $state, $code): string {
            $current = DB::table('notification_outbox')->where('id', $job->id)->lockForUpdate()->first();
            if ($current && $current->state === 'processing' && $current->claim_token === $job->claim_token) {
                $this->save($current, $state, $code);

                return $state;
            }

            return $current->state ?? 'skipped';
        }, 3);
    }

    private function save(object $row, string $state, string $code): void
    {
        $wait = 60 * (2 ** max(0, min(5, (int) $row->attempts) - 1));
        DB::table('notification_outbox')->where('id', $row->id)->update(['state' => $state, 'error_code' => $code, 'available_at' => $state === 'retry' ? now('UTC')->addSeconds($wait) : $row->available_at, 'claim_token' => null, 'lease_until' => null, 'updated_at' => now('UTC')]);
        DB::table('notification_attempts')->where('outbox_id', $row->id)->where('ordinal', $row->attempts)->where('state', 'started')->update(['state' => $state, 'code' => $code, 'finished_at' => now('UTC')]);
        if ($state !== 'retry') {
            DB::table('notifications')->updateOrInsert(['id' => $row->id], ['user_id' => $row->user_id, 'reservation_id' => $row->reservation_id, 'channel' => $row->channel, 'type' => $row->type, 'message' => json_decode($row->payload, true, flags: JSON_THROW_ON_ERROR)['subject'], 'status' => in_array($state, ['sent', 'simulated'], true) ? $state : 'failed', 'created_at' => now('UTC')]);
        }
    }

    public function retry(string $id): bool
    {
        return DB::transaction(function () use ($id): bool {
            $row = DB::table('notification_outbox')->where('id', $id)->lockForUpdate()->first();
            if (! $row || ! in_array($row->state, ['unavailable', 'failed'], true) || $row->attempts >= 5 || ! in_array($row->error_code, ['channel_disabled', 'smtp_configuration', 'recipient_invalid', 'channel_configuration', 'whatsapp_configuration', 'provider_rejected'], true)) {
                return false;
            }
            DB::table('notification_outbox')->where('id', $id)->update(['state' => 'queued', 'available_at' => now('UTC'), 'updated_at' => now('UTC')]);

            return true;
        }, 3);
    }
}
