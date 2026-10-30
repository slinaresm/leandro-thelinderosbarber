<?php

namespace App\Files;

use App\Security\EntityAccess;
use Illuminate\Support\Facades\DB;

class ClientDocuments
{
    public function forWrite(object $user, ?string $clientId, ?string $reservationId = null): object
    {
        abort_unless($user->role === 'barbero', 403);
        $barber = DB::table('barbers')->where('user_id', $user->id)->lockForUpdate()->first();
        abort_unless($barber && (int) $barber->active === 1, 403);
        if ($clientId !== null) {
            abort_unless(app(EntityAccess::class)->client($user, $clientId), 403);
        }
        if ($reservationId !== null) {
            $reservation = DB::table('reservations')->where('id', $reservationId)->lockForUpdate()->first();
            abort_unless($reservation && $reservation->client_id === $clientId && $reservation->barber_id === $barber->id && $reservation->status !== 'cancelled', 403);
        }

        return $barber;
    }

    public function canReadPhoto(object $user, object $photo): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'cliente') {
            return $photo->client_id !== null && DB::table('clients')->where('id', $photo->client_id)->where('user_id', $user->id)->exists();
        }

        return $user->role === 'barbero' && DB::table('barbers')->where('id', $photo->barber_id)->where('user_id', $user->id)->exists();
    }
}
