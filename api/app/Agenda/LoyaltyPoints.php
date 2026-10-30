<?php

namespace App\Agenda;

use Illuminate\Support\Facades\DB;

class LoyaltyPoints
{
    /** @return array{points:int, level:string} */
    public function awardVisit(string $clientId): array
    {
        $client = DB::table('clients')->where('id', $clientId)->lockForUpdate()->first();
        abort_unless($client, 409);
        $points = (int) ($client->loyalty_points ?? 0);
        abort_if($points > 9007199254740981, 409);
        $points += 10;
        $level = match (true) {
            $points >= 500 => 'Black',
            $points >= 200 => 'Oro',
            $points >= 80 => 'Plata',
            default => 'Bronce',
        };
        DB::table('clients')->where('id', $clientId)->update(['loyalty_points' => $points, 'loyalty_level' => $level]);

        return ['points' => $points, 'level' => $level];
    }
}
