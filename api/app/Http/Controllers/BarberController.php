<?php

namespace App\Http\Controllers;

use App\Agenda\AgendaTime;
use App\Events\AgendaEvents;
use App\Security\EntityAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class BarberController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        abort_if($request->query() !== [], 400);
        $row = DB::table('barbers as b')->join('users as u', 'u.id', '=', 'b.user_id')->where('b.user_id', $request->user()->id)->first(['b.id', 'b.specialty', 'b.photo_url', 'b.active', 'b.work_start', 'b.work_end', 'u.name']);
        abort_unless($row, 403);

        return response()->json(['barber' => $this->format($row)]);
    }

    public function all(Request $request): JsonResponse
    {
        abort_if($request->query() !== [], 400);

        return response()->json(['barbers' => DB::table('barbers as b')->join('users as u', 'u.id', '=', 'b.user_id')->orderByDesc('b.active')->orderBy('u.name')->orderBy('b.id')->get(['b.id', 'b.specialty', 'b.photo_url', 'b.active', 'b.work_start', 'b.work_end', 'u.name', 'u.email', 'u.deleted_at as user_deleted_at'])->map(fn (object $row) => $this->format($row))]);
    }

    public function index(): JsonResponse
    {
        return response()->json(['barbers' => DB::table('barbers as b')->join('users as u', 'u.id', '=', 'b.user_id')->where('b.active', 1)->whereNull('u.deleted_at')->get(['b.id', 'b.specialty', 'b.photo_url', 'b.active', 'b.work_start', 'b.work_end', 'u.name', 'u.email'])->map(fn (object $row) => $this->format($row))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->only(['name', 'email', 'password', 'specialty', 'photo_url']);
        if (is_string($data['email'] ?? null)) {
            $data['email'] = mb_strtolower(trim($data['email']), 'UTF-8');
        }
        if (is_string($data['name'] ?? null)) {
            $data['name'] = trim($data['name']);
        }
        abort_if(Validator::make($data, [
            'name' => ['required', 'string', 'min:2', 'max:100', 'not_regex:/[<>]/'],
            'email' => ['required', 'string', 'max:254', 'regex:/^[^\s@]+@[^\s@]+\.[^\s@]+$/u'],
            'password' => ['required', 'string', 'min:12'],
            'specialty' => ['nullable', 'string', 'max:200'],
            'photo_url' => ['nullable', 'string', 'max:2048', 'regex:~^(?:https?://|/)[^\s]*$~'],
        ])->fails(), 400);
        abort_if(strlen($data['password']) > 72 || str_contains($data['password'], "\0"), 400);
        try {
            $barber = DB::transaction(function () use ($data): array {
                $user = (string) Str::uuid();
                $id = (string) Str::uuid();
                DB::table('users')->insert(['id' => $user, 'name' => $data['name'], 'email' => $data['email'], 'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT), 'role' => 'barbero']);
                DB::table('barbers')->insert(['id' => $id, 'user_id' => $user, 'specialty' => $data['specialty'] ?? null, 'photo_url' => $data['photo_url'] ?? null]);

                app(AgendaEvents::class)->catalog($id);

                return ['id' => $id, 'name' => $data['name'], 'email' => $data['email'], 'specialty' => $data['specialty'] ?? null, 'photo_url' => $data['photo_url'] ?? null];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            return response()->json(['error' => 'Ya existe una cuenta con ese email.'], 409);
        }

        return response()->json(['barber' => $barber], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('identity')['user'];
        $admin = $user->role === 'admin';
        $data = $request->only($admin ? ['specialty', 'photo_url', 'active', 'work_start', 'work_end'] : ['work_start', 'work_end']);
        abort_if(Validator::make($data, [
            'specialty' => ['sometimes', 'nullable', 'string', 'max:200'],
            'photo_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:~^(?:https?://|/)[^\s]*$~'],
            'active' => ['sometimes', 'boolean'],
            'work_start' => ['sometimes', 'string', 'regex:/^(?:[01][0-9]|2[0-3]):00$/D'],
            'work_end' => ['sometimes', 'string', 'regex:/^(?:[01][0-9]|2[0-3]):00$/D'],
        ])->fails(), 400);
        $barber = DB::transaction(function () use ($id, $user, $admin, $data): object {
            $barber = DB::table('barbers')->where('id', $id)->lockForUpdate()->first();
            abort_unless($barber, 404);
            abort_unless($admin || $barber->user_id === $user->id, 403);
            $time = app(AgendaTime::class);
            $start = $time->minutes(substr($data['work_start'] ?? $barber->work_start ?? '09:00', 0, 5));
            $end = $time->minutes(substr($data['work_end'] ?? $barber->work_end ?? '22:00', 0, 5));
            abort_if($start < 540 || $end > 1320 || $start >= $end, 400);
            if ($data !== []) {
                DB::table('barbers')->where('id', $id)->update($data);
                app(AgendaEvents::class)->catalog($id);
            }

            return $this->format(DB::table('barbers')->find($id));
        }, 3);

        return response()->json(['barber' => $barber]);
    }

    public function clients(Request $request, string $id): JsonResponse
    {
        $this->authorizeBarber($request, $id);
        $clients = DB::table('reservations as r')->join('clients as c', 'c.id', '=', 'r.client_id')->join('users as u', 'u.id', '=', 'c.user_id')->where('r.barber_id', $id)->where('r.status', '!=', 'cancelled')->distinct()->get(['c.id', 'u.name', 'u.email', 'u.phone', 'c.loyalty_level']);

        return response()->json(['clients' => $clients]);
    }

    public function stats(Request $request, string $id): JsonResponse
    {
        $this->authorizeBarber($request, $id);
        $query = DB::table('reservations')->where('barber_id', $id);

        return response()->json(['stats' => [
            'totalCompleted' => (clone $query)->where('status', 'completed')->count(),
            'totalUpcoming' => (clone $query)->where('status', 'confirmed')->where('date', '>=', CarbonImmutable::now(AgendaTime::ZONE)->format('Y-m-d'))->count(),
            'uniqueClients' => (clone $query)->where('status', '!=', 'cancelled')->distinct()->count('client_id'),
        ]]);
    }

    private function authorizeBarber(Request $request, string $id): void
    {
        abort_unless(app(EntityAccess::class)->barber($request->attributes->get('identity')['user'], $id), 403);
    }

    private function format(object $row): object
    {
        foreach (['work_start', 'work_end'] as $key) {
            if (isset($row->$key)) {
                $row->$key = substr($row->$key, 0, 5);
            }
        }

        return $row;
    }
}
