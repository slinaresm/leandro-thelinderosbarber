<?php

namespace App\Agenda;

use App\Events\AgendaEvents;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReservationAgenda
{
    public function __construct(private AgendaTime $time, private LoyaltyPoints $loyalty) {}

    /** @param array<string, mixed> $data */
    public function create(object $user, array $data): object
    {
        abort_unless($user->role === 'cliente', 403);

        return $this->transaction(function () use ($user, $data): object {
            $barber = $this->barber($data['barberId'], true);
            $service = DB::table('services')->where('id', $data['serviceId'])->sharedLock()->first();
            abort_unless($service && (int) $service->active === 1, 404);
            $client = DB::table('clients')->where('user_id', $user->id)->first();
            abort_unless($client, 403);
            $interval = $this->time->interval($barber, $data['date'], $data['startTime'], (int) $service->duration_minutes);
            $this->assertFree($barber->id, $interval);
            $id = (string) Str::uuid();
            DB::table('reservations')->insert([
                'id' => $id, 'client_id' => $client->id, 'barber_id' => $barber->id, 'service_id' => $service->id,
                ...$interval, 'notes' => $data['notes'] ?? null,
                'service_name_snapshot' => $service->name, 'service_price_snapshot' => $service->price, 'service_duration_snapshot' => $service->duration_minutes,
            ]);

            $saved = DB::table('reservations')->find($id);
            app(NotificationOutbox::class)->appointment($saved, 'confirmacion');
            app(AgendaEvents::class)->reservation($saved);

            return $this->format($saved);
        });
    }

    /** @param array<string, mixed> $data
     * @return object|array<string, mixed>
     */
    public function transition(object $user, string $id, string $action, array $data = []): object|array
    {
        $initial = DB::table('reservations')->find($id);
        abort_unless($initial, 404);
        $this->authorize($user, $initial, $action);

        return $this->transaction(function () use ($initial, $user, $id, $action, $data): object|array {
            $barber = $this->barber($initial->barber_id, false);
            $reservation = DB::table('reservations')->where('id', $id)->lockForUpdate()->first();
            abort_unless($reservation, 404);
            $this->authorize($user, $reservation, $action);
            abort_unless($reservation->status === 'confirmed', 409);
            $update = ['updated_at' => now('UTC')->format('Y-m-d H:i:s.u')];
            if ($action === 'reschedule') {
                abort_unless((int) $barber->active === 1 && DB::table('users')->where('id', $barber->user_id)->whereNull('deleted_at')->exists(), 404);
                $duration = $reservation->service_duration_snapshot;
                if (! $duration) {
                    $duration = DB::table('services')->where('id', $reservation->service_id)->value('duration_minutes');
                }
                $interval = $this->time->interval($barber, $data['date'], $data['startTime'], (int) $duration);
                $this->assertFree($barber->id, $interval, $id);
                $update += [...$interval, 'notified_24h' => 0, 'notified_2h' => 0, 'notification_version' => (int) $reservation->notification_version + 1];
            } else {
                $update['status'] = $action === 'cancel' ? 'cancelled' : 'completed';
            }
            DB::table('reservations')->where('id', $id)->update($update);
            if ($action === 'complete') {
                $loyalty = $this->loyalty->awardVisit($reservation->client_id);
                app(AgendaEvents::class)->reservation(DB::table('reservations')->find($id));

                return $loyalty;
            }

            $saved = DB::table('reservations')->find($id);
            app(NotificationOutbox::class)->appointment($saved, $action === 'cancel' ? 'cancelacion' : 'confirmacion');
            app(AgendaEvents::class)->reservation($saved, $action === 'reschedule' ? $reservation->date : null);

            return $this->format($saved);
        });
    }

    public function authorize(object $user, object $reservation, string $action): void
    {
        if ($user->role === 'admin') {
            return;
        }
        if ($user->role === 'barbero') {
            abort_unless(DB::table('barbers')->where('id', $reservation->barber_id)->where('user_id', $user->id)->exists(), 403);

            return;
        }
        abort_unless($user->role === 'cliente' && $action !== 'complete' && DB::table('clients')->where('id', $reservation->client_id)->where('user_id', $user->id)->exists(), 403);
    }

    public function barber(string $id, bool $active): object
    {
        $barber = DB::table('barbers')->where('id', $id)->lockForUpdate()->first();
        abort_unless($barber, 404);
        if ($active) {
            abort_unless((int) $barber->active === 1 && DB::table('users')->where('id', $barber->user_id)->whereNull('deleted_at')->exists(), 404);
        }

        return $barber;
    }

    /** @param array<string, string> $interval */
    private function assertFree(string $barberId, array $interval, ?string $exclude = null): void
    {
        $query = DB::table('reservations')->where('barber_id', $barberId)->where('date', $interval['date'])->where('status', 'confirmed')->where('start_time', '<', $interval['end_time'])->where('end_time', '>', $interval['start_time']);
        if ($exclude !== null) {
            $query->where('id', '!=', $exclude);
        }
        abort_if($query->lockForUpdate()->first() !== null, 409);
    }

    public function format(object $row): object
    {
        foreach (['start_time', 'end_time'] as $key) {
            $row->$key = substr($row->$key, 0, 5);
        }

        return $row;
    }

    private function transaction(Closure $operation): mixed
    {
        try {
            return DB::transaction($operation, 3);
        } catch (QueryException $error) {
            if (in_array((int) ($error->errorInfo[1] ?? 0), [1205, 1213], true)) {
                abort(409);
            }
            throw $error;
        }
    }
}
