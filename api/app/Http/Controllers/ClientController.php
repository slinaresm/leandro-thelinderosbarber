<?php

namespace App\Http\Controllers;

use App\Security\EntityAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        abort_if($request->query() !== [], 400);
        $id = DB::table('clients')->where('user_id', $request->attributes->get('identity')['user']->id)->value('id');
        abort_unless(is_string($id), 403);

        return $this->show($request, $id);
    }

    public function index(): JsonResponse
    {
        $clients = DB::table('clients as c')->join('users as u', 'u.id', '=', 'c.user_id')->orderByDesc('c.created_at')->orderBy('c.id')->get(['c.id', 'c.loyalty_points', 'c.loyalty_level', 'u.name', 'u.email', 'u.phone', 'c.created_at']);

        return response()->json(['clients' => $clients]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizeClient($request, $id);
        $client = DB::table('clients as c')->join('users as u', 'u.id', '=', 'c.user_id')->where('c.id', $id)->first(['c.id', 'c.loyalty_points', 'c.loyalty_level', 'c.birthday', 'u.name', 'u.email', 'u.phone']);
        abort_unless($client, 404);

        return response()->json(['client' => $client]);
    }

    public function history(Request $request, string $id): JsonResponse
    {
        $this->authorizeClient($request, $id);
        abort_unless(DB::table('clients')->where('id', $id)->exists(), 404);
        $user = $request->attributes->get('identity')['user'];
        $query = DB::table('reservations as r')->join('services as s', 's.id', '=', 'r.service_id')->join('barbers as b', 'b.id', '=', 'r.barber_id')->join('users as ub', 'ub.id', '=', 'b.user_id')->where('r.client_id', $id);
        if ($user->role === 'barbero') {
            $query->where('b.user_id', $user->id)->where('r.status', '!=', 'cancelled');
        }
        $history = $query->orderByDesc('r.date')->orderByDesc('r.start_time')->orderBy('r.id')->get([
            'r.id', 'r.date', 'r.start_time', 'r.status',
            DB::raw('COALESCE(r.service_name_snapshot, s.name) as service_name'),
            DB::raw('COALESCE(r.service_price_snapshot, s.price) as price'),
            DB::raw('COALESCE(r.service_duration_snapshot, s.duration_minutes) as duration_minutes'),
            'ub.name as barber_name',
        ])->map(function (object $row): object {
            $row->start_time = substr($row->start_time, 0, 5);

            return $row;
        });

        return response()->json(['history' => $history]);
    }

    private function authorizeClient(Request $request, string $id): void
    {
        abort_unless(app(EntityAccess::class)->client($request->attributes->get('identity')['user'], $id), 403);
    }
}
