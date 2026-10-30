<?php

namespace App\Events;

use Illuminate\Support\Facades\DB;
use LogicException;

class AgendaEvents
{
    public function reservation(object $reservation, ?string $previousDate = null): void
    {
        $clientUser = DB::table('clients')->where('id', $reservation->client_id)->value('user_id');
        $barberUser = DB::table('barbers')->where('id', $reservation->barber_id)->value('user_id');
        $this->append(['kind' => 'reservation.changed', 'reservation_id' => $reservation->id, 'barber_id' => $reservation->barber_id, 'date' => $reservation->date, 'previous_date' => $previousDate, 'client_user_id' => $clientUser, 'barber_user_id' => $barberUser]);
    }

    public function order(object $order): void
    {
        $clientUser = $order->client_id === null ? null : DB::table('clients')->where('id', $order->client_id)->value('user_id');
        $this->append(['kind' => 'order.changed', 'order_id' => $order->id, 'client_user_id' => $clientUser]);
    }

    public function catalog(?string $barberId = null): void
    {
        $this->append(['kind' => 'catalog.changed', 'barber_id' => $barberId]);
    }

    /** @param array<string, mixed> $data */
    private function append(array $data): void
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Los avisos requieren la transacción de negocio.');
        }
        $clock = DB::table('event_clock')->where('id', 1)->lockForUpdate()->first();
        abort_unless($clock && (int) $clock->sequence < PHP_INT_MAX, 503);
        $sequence = (int) $clock->sequence + 1;
        DB::table('event_clock')->where('id', 1)->update(['sequence' => $sequence]);
        DB::table('agenda_events')->insert(['id' => $sequence, ...$data, 'created_at' => now('UTC')->format('Y-m-d H:i:s.u')]);
    }
}
