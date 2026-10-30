<?php

namespace App\Http\Controllers;

use App\Agenda\AgendaTime;
use App\Agenda\ReservationAgenda;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ReservationController extends Controller
{
    public function __construct(private ReservationAgenda $agenda, private AgendaTime $time) {}

    public function availability(Request $request): JsonResponse
    {
        $data = $request->only(['barberId', 'serviceId', 'date']);
        abort_if(Validator::make($data, ['barberId' => ['required', 'string', 'max:191'], 'serviceId' => ['required', 'string', 'max:191'], 'date' => ['required', 'string']])->fails(), 400);
        $this->time->date($data['date']);
        $service = DB::table('services')->where('id', $data['serviceId'])->where('active', 1)->first();
        $barber = DB::table('barbers as b')->join('users as u', 'u.id', '=', 'b.user_id')->where('b.id', $data['barberId'])->where('b.active', 1)->whereNull('u.deleted_at')->first(['b.*']);
        abort_unless($service && $barber, 404);
        [$open, $close] = $this->time->hours($barber);
        $booked = DB::table('reservations')->where('barber_id', $barber->id)->where('date', $data['date'])->where('status', 'confirmed')->get(['start_time', 'end_time']);
        $available = [];
        $duration = (int) $service->duration_minutes;
        for ($start = $open; $start + $duration <= $close; $start += 60) {
            $time = $this->time->hhmm($start);
            if (! $this->time->instant($data['date'], $time)->greaterThan(CarbonImmutable::now('UTC'))) {
                continue;
            }
            if ($booked->contains(fn (object $row) => $start < $this->time->minutes(substr($row->end_time, 0, 5)) && $start + $duration > $this->time->minutes(substr($row->start_time, 0, 5)))) {
                continue;
            }
            $available[] = $time;
        }

        return response()->json(['date' => $data['date'], 'barberId' => $barber->id, 'serviceId' => $service->id, 'durationMinutes' => $duration, 'availableSlots' => $available]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('identity')['user'];
        $query = DB::table('reservations as r')->join('services as s', 's.id', '=', 'r.service_id')->join('barbers as b', 'b.id', '=', 'r.barber_id')->join('users as ub', 'ub.id', '=', 'b.user_id')->join('clients as c', 'c.id', '=', 'r.client_id')->join('users as uc', 'uc.id', '=', 'c.user_id');
        $fields = ['r.*', DB::raw('COALESCE(r.service_name_snapshot, s.name) as service_name'), DB::raw('COALESCE(r.service_price_snapshot, s.price) as price'), DB::raw('COALESCE(r.service_duration_snapshot, s.duration_minutes) as duration_minutes')];
        if ($user->role === 'barbero') {
            $query->where('b.user_id', $user->id);
            $fields = [...$fields, 'uc.name as client_name', 'uc.phone as client_phone'];
        } elseif ($user->role === 'cliente') {
            $query->where('c.user_id', $user->id);
            $fields[] = 'ub.name as barber_name';
        } else {
            $fields = [...$fields, 'uc.name as client_name', 'ub.name as barber_name'];
        }

        return response()->json(['reservations' => $query->orderByDesc('r.date')->orderByDesc('r.start_time')->get($fields)->map(fn (object $row) => $this->agenda->format($row))]);
    }

    public function store(Request $request): JsonResponse
    {
        $reservation = $this->agenda->create($request->attributes->get('identity')['user'], $this->input($request, true));
        $service = DB::table('services')->find($reservation->service_id);
        $barber = DB::table('barbers')->find($reservation->barber_id);
        $client = DB::table('clients')->find($reservation->client_id);
        $clientUser = DB::table('users')->find($client->user_id);
        $reservation->service_name = $reservation->service_name_snapshot ?? $service->name;
        $reservation->price = $reservation->service_price_snapshot ?? $service->price;
        $reservation->barber_name = DB::table('users')->where('id', $barber->user_id)->value('name');
        $reservation->client_name = $clientUser->name;
        $reservation->client_user_id = $clientUser->id;
        $reservation->client_email = $clientUser->email;
        $reservation->client_phone = $clientUser->phone;

        return response()->json(['reservation' => $reservation], 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $this->agenda->transition($request->attributes->get('identity')['user'], $id, 'cancel');

        return response()->json(['message' => 'Reserva cancelada. El horario esta disponible de nuevo.']);
    }

    public function reschedule(Request $request, string $id): JsonResponse
    {
        return response()->json(['reservation' => $this->agenda->transition($request->attributes->get('identity')['user'], $id, 'reschedule', $this->input($request, false))]);
    }

    public function complete(Request $request, string $id): JsonResponse
    {
        $loyalty = $this->agenda->transition($request->attributes->get('identity')['user'], $id, 'complete');

        return response()->json(['message' => 'Cita marcada como completada.', 'loyalty' => $loyalty]);
    }

    /** @return array<string, mixed> */
    private function input(Request $request, bool $create): array
    {
        $data = $request->only($create ? ['barberId', 'serviceId', 'date', 'startTime', 'notes'] : ['date', 'startTime']);
        $rules = ['date' => ['required', 'string', 'size:10'], 'startTime' => ['required', 'string', 'size:5']];
        if ($create) {
            $rules += ['barberId' => ['required', 'string', 'max:191'], 'serviceId' => ['required', 'string', 'max:191'], 'notes' => ['nullable', 'string', 'max:4000']];
        }
        abort_if(Validator::make($data, $rules)->fails(), 400);

        return $data;
    }
}
