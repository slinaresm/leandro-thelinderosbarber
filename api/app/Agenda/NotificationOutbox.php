<?php

namespace App\Agenda;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use LogicException;

class NotificationOutbox
{
    public function welcome(string $userId): void
    {
        $user = DB::table('users')->find($userId);
        $this->enqueue($userId, null, 0, 'email', 'welcome', ['subject' => 'Bienvenido a Barber Linderos', 'name' => $user->name, 'detail' => 'Tu cuenta fue creada. Ya puedes reservar tu próximo corte.', 'when' => ''], CarbonImmutable::now('UTC')->addDay());
    }

    public function appointment(object $reservation, string $type): void
    {
        $client = DB::table('clients')->find($reservation->client_id);
        $user = $client ? DB::table('users')->find($client->user_id) : null;
        if (! $user || $user->deleted_at !== null) {
            return;
        }
        $barber = DB::table('barbers')->find($reservation->barber_id);
        $barberName = $barber ? DB::table('users')->where('id', $barber->user_id)->value('name') : '';
        $service = $reservation->service_name_snapshot ?? DB::table('services')->where('id', $reservation->service_id)->value('name');
        $start = $type === 'cancelacion' ? CarbonImmutable::now('UTC')->addDay() : app(ReminderSweep::class)->instant($reservation);
        $subject = match ($type) {
            'confirmacion' => 'Tu reserva en Barber Linderos está confirmada',
            'cancelacion' => 'Tu reserva en Barber Linderos fue cancelada',
            default => 'Recordatorio: tu cita en Barber Linderos se aproxima',
        };
        $payload = ['subject' => $subject, 'name' => $user->name, 'detail' => $service.' con '.$barberName, 'when' => $reservation->date.' '.substr($reservation->start_time, 0, 5).' America/Santiago'];
        foreach ($type === 'cancelacion' || ! $user->phone ? ['email'] : ['email', 'whatsapp'] as $channel) {
            $this->enqueue($user->id, (string) $reservation->id, (int) $reservation->notification_version, $channel, $type, $payload, $type === 'cancelacion' ? CarbonImmutable::now('UTC')->addDay() : $start);
        }
    }

    /** @param array<string,string> $payload */
    private function enqueue(string $user, ?string $reservation, int $version, string $channel, string $type, array $payload, CarbonImmutable $expires): void
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Encolar requiere la transacción de negocio.');
        }
        $id = hash('sha256', json_encode([$user, $reservation, $version, $channel, $type], JSON_THROW_ON_ERROR));
        DB::table('notification_outbox')->insertOrIgnore(['id' => $id, 'user_id' => $user, 'reservation_id' => $reservation, 'version' => $version, 'channel' => $channel, 'type' => $type, 'payload' => json_encode($payload, JSON_THROW_ON_ERROR), 'available_at' => now('UTC'), 'expires_at' => $expires, 'created_at' => now('UTC'), 'updated_at' => now('UTC')]);
    }
}
