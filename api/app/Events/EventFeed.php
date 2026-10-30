<?php

namespace App\Events;

use App\Security\JwtSessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

class EventFeed
{
    /** @return array<string, mixed> */
    public function batch(Request $request, ?string $cursor): array
    {
        abort_if(($request->headers->has('Origin') && $request->header('Origin') !== config('jwt.origin')) || $request->header('Sec-Fetch-Site') === 'cross-site', 403);
        $input = $request->query();
        abort_if(array_diff(array_keys($input), ['scope', 'barberId', 'date', 'cursor']) !== [], 400);
        abort_if(Validator::make($input, ['scope' => ['required', 'string', 'in:availability,private'], 'barberId' => ['sometimes', 'string', 'max:191'], 'date' => ['sometimes', 'date_format:Y-m-d'], 'cursor' => ['sometimes', 'string', 'max:4096']])->fails(), 400);
        $user = null;
        if ($input['scope'] === 'private') {
            abort_if(isset($input['barberId']) || isset($input['date']), 403);
            $token = app(JwtSessions::class)->token($request);
            abort_unless($token, 401);
            $user = app(JwtSessions::class)->authenticate($token)['user'];
            $binding = 'private:'.$user->id.':'.$user->role;
        } else {
            abort_unless(isset($input['barberId'], $input['date']), 400);
            $binding = 'availability:'.$input['barberId'].':'.$input['date'];
        }
        $head = (int) DB::table('event_clock')->where('id', 1)->value('sequence');
        $sequence = null;
        if (is_string($cursor) && strlen($cursor) <= 4096) {
            try {
                $decoded = json_decode(Crypt::decryptString($cursor), true, flags: JSON_THROW_ON_ERROR);
                if (($decoded['binding'] ?? null) === $binding && is_int($decoded['sequence'] ?? null) && $decoded['sequence'] >= 0 && $decoded['sequence'] <= $head && ($decoded['expires'] ?? 0) > now()->timestamp) {
                    $sequence = $decoded['sequence'];
                }
            } catch (Throwable) {
                $sequence = null;
            }
        }
        $floor = DB::table('agenda_events')->where('created_at', '>=', now('UTC')->subDay())->min('id');
        if ($sequence !== null && $sequence < $head && ($floor === null || $sequence < (int) $floor - 1)) {
            $sequence = null;
        }
        $reset = $sequence === null;
        $changes = [];
        $more = false;
        if (! $reset) {
            $query = DB::table('agenda_events')->where('id', '>', $sequence)->where('id', '<=', $head)->where('created_at', '>=', now('UTC')->subDay());
            if ($user) {
                if ($user->role !== 'admin') {
                    $column = $user->role === 'barbero' ? 'barber_user_id' : 'client_user_id';
                    $query->where(fn ($query) => $query->where($column, $user->id)->orWhere('kind', 'catalog.changed'));
                }
            } else {
                $query->whereIn('kind', ['catalog.changed', 'reservation.changed']);
                $query->where(fn ($query) => $query->where('barber_id', $input['barberId'])->orWhereNull('barber_id'))
                    ->where(fn ($query) => $query->where('date', $input['date'])->orWhere('previous_date', $input['date'])->orWhere('kind', 'catalog.changed'));
            }
            $rows = $query->orderBy('id')->limit(101)->get();
            $more = $rows->count() > 100;
            foreach ($rows->take(100) as $row) {
                $change = match ($row->kind) {
                    'catalog.changed' => ['type' => 'catalog.changed'],
                    'order.changed' => ['type' => 'order.changed', 'orderId' => $row->order_id],
                    default => $user ? ['type' => 'reservation.changed', 'reservationId' => $row->reservation_id] : ['type' => 'availability.changed', 'barberId' => $input['barberId'], 'date' => $input['date']],
                };
                $changes[] = $change;
            }
            if ($more) {
                $head = (int) $rows[99]->id;
            }
        }
        $next = Crypt::encryptString(json_encode(['binding' => $binding, 'sequence' => $head, 'expires' => now()->addDay()->timestamp], JSON_THROW_ON_ERROR));

        return ['changes' => $changes, 'cursor' => $next, 'reset' => $reset, 'more' => $more, 'retryMs' => 2000];
    }
}
