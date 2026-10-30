<?php

namespace App\Security;

use Illuminate\Support\Facades\DB;

class EntityAccess
{
    public function client(object $user, string $clientId): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'cliente') {
            return DB::table('clients')->where('id', $clientId)->where('user_id', $user->id)->exists();
        }
        if ($user->role === 'barbero') {
            return DB::table('reservations')->join('barbers', 'barbers.id', '=', 'reservations.barber_id')->where('barbers.user_id', $user->id)->where('reservations.client_id', $clientId)->where('reservations.status', '!=', 'cancelled')->exists();
        }

        return false;
    }

    public function barber(object $user, string $barberId): bool
    {
        return $user->role === 'admin' || ($user->role === 'barbero' && DB::table('barbers')->where('id', $barberId)->where('user_id', $user->id)->exists());
    }
}
