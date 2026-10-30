<?php

namespace App\Http\Controllers;

use App\Commerce\AuditTrail;
use App\Events\AgendaEvents;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AdminUserController extends Controller
{
    private const FIELDS = ['id', 'name', 'email', 'role', 'phone', 'deleted_at', 'created_at'];

    public function index(Request $request): JsonResponse
    {
        abort_if($request->query() !== [], 400);

        return response()->json(['users' => DB::table('users')->orderBy('name')->orderBy('id')->get(self::FIELDS)->map(fn (object $user): array => $this->view($user))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->input($request, ['name', 'email', 'phone', 'role', 'password', 'password_confirmation'], [
            ...$this->profileRules(true), ...$this->passwordRules(),
        ]);
        $hash = password_hash($data['password'], PASSWORD_BCRYPT);
        try {
            $user = DB::transaction(function () use ($request, $data, $hash): array {
                $this->lockActor($request);
                $id = (string) Str::uuid();
                DB::table('users')->insert(['id' => $id, 'name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null, 'role' => $data['role'], 'password_hash' => $hash]);
                $this->profiles($id, $data['role']);
                $after = $this->view(DB::table('users')->find($id, self::FIELDS));
                app(AuditTrail::class)->record($request->user()->id, 'user', $id, 'user_created', null, (object) $after);

                return $after;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            abort(409);
        }

        return response()->json(['user' => $user], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, ['name', 'email', 'phone', 'role'], $this->profileRules(false));
        abort_if($data === [], 400);

        return $this->modify($request, $id, $data, 'user_updated');
    }

    public function password(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, ['password', 'password_confirmation'], $this->passwordRules());

        return $this->modify($request, $id, ['password_hash' => password_hash($data['password'], PASSWORD_BCRYPT)], 'user_password_changed');
    }

    public function status(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, ['active'], ['active' => ['required', 'boolean']]);

        return $this->modify($request, $id, ['deleted_at' => $data['active'] ? null : now('UTC')->format('Y-m-d H:i:s')], $data['active'] ? 'user_reactivated' : 'user_disabled');
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->input($request, [], []);

        return $this->modify($request, $id, ['deleted_at' => now('UTC')->format('Y-m-d H:i:s')], 'user_disabled');
    }

    /** @param array<string,mixed> $data */
    private function modify(Request $request, string $id, array $data, string $action): JsonResponse
    {
        try {
            $result = DB::transaction(function () use ($request, $id, $data, $action): array {
                $users = $this->lockActor($request);
                $target = $users->firstWhere('id', $id);
                abort_unless($target, 404);
                $role = $data['role'] ?? $target->role;
                $disabled = array_key_exists('deleted_at', $data) ? $data['deleted_at'] !== null : $target->deleted_at !== null;
                $losesAdmin = $target->role === 'admin' && $target->deleted_at === null && ($role !== 'admin' || $disabled);
                abort_if($id === $request->user()->id && ($disabled || $role !== $target->role), 409);
                abort_if($losesAdmin && $users->where('role', 'admin')->whereNull('deleted_at')->count() <= 1, 409);
                $before = $this->view($target);
                $revoke = isset($data['password_hash']) || array_key_exists('deleted_at', $data) || $role !== $target->role || (isset($data['email']) && $data['email'] !== $target->email);
                DB::table('users')->where('id', $id)->update($data);
                $this->profiles($id, $role);
                if ($revoke) {
                    DB::table('jwt_sessions')->where('user_id', $id)->whereNull('revoked_at')->update(['revoked_at' => now('UTC')->format('Y-m-d H:i:s')]);
                }
                $after = $this->view(DB::table('users')->find($id, self::FIELDS));
                app(AuditTrail::class)->record($request->user()->id, 'user', $id, $action, (object) $before, (object) $after);

                return ['user' => $after, 'sessionsRevoked' => $revoke];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            abort(409);
        }

        return response()->json($result);
    }

    /** @return Collection<int,object> */
    private function lockActor(Request $request): Collection
    {
        $users = DB::table('users')->orderBy('id')->lockForUpdate()->get(self::FIELDS);
        $actor = $users->firstWhere('id', $request->user()->id);
        abort_unless($actor && $actor->role === 'admin' && $actor->deleted_at === null, 403);
        $session = DB::table('jwt_sessions')->where('jti', $request->attributes->get('identity')['jti'])->whereNull('revoked_at')->where('expires_at', '>', now('UTC')->format('Y-m-d H:i:s'))->lockForUpdate()->first(['jti']);
        abort_unless($session, 401);

        return $users;
    }

    private function profiles(string $id, string $role): void
    {
        if ($role === 'cliente' && ! DB::table('clients')->where('user_id', $id)->exists()) {
            DB::table('clients')->insert(['id' => (string) Str::uuid(), 'user_id' => $id]);
        }
        $barber = DB::table('barbers')->where('user_id', $id)->first(['id']);
        if ($role === 'barbero' && ! $barber) {
            $barberId = (string) Str::uuid();
            DB::table('barbers')->insert(['id' => $barberId, 'user_id' => $id]);
        } elseif ($barber) {
            $barberId = $barber->id;
            if ($role !== 'barbero') {
                DB::table('barbers')->where('id', $barberId)->update(['active' => false]);
            }
        }
        if (isset($barberId)) {
            app(AgendaEvents::class)->catalog($barberId);
        }
    }

    /** @return array<string,mixed> */
    private function view(object $user): array
    {
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'phone' => $user->phone, 'role' => $user->role, 'active' => $user->deleted_at === null, 'disabled_at' => $user->deleted_at, 'created_at' => $user->created_at];
    }

    /** @return array<string,array> */
    private function profileRules(bool $creating): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$presence, 'required', 'string', 'min:2', 'max:100', 'not_regex:/[<>]/'],
            'email' => [$presence, 'required', 'string', 'max:254', 'regex:/^[^\s@]+@[^\s@]+\.[^\s@]+$/u'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^[\d +()\-]*$/'],
            'role' => [$presence, 'required', 'string', 'in:admin,barbero,cliente'],
        ];
    }

    /** @return array<string,array> */
    private function passwordRules(): array
    {
        return ['password' => ['required', 'string', 'min:12', 'confirmed', function (string $attribute, mixed $value, \Closure $fail): void {
            if (! is_string($value) || strlen($value) > 72 || str_contains($value, "\0")) {
                $fail('Contraseña inválida.');
            }
        }], 'password_confirmation' => ['required', 'string']];
    }

    /** @param list<string> $allowed
     * @param  array<string,array>  $rules
     * @return array<string,mixed>
     */
    private function input(Request $request, array $allowed, array $rules): array
    {
        abort_if($request->query() !== [] || array_diff(array_keys($request->all()), $allowed) !== [], 400);
        $data = $request->only($allowed);
        if (is_string($data['email'] ?? null)) {
            $data['email'] = mb_strtolower(trim($data['email']), 'UTF-8');
        }
        if (is_string($data['name'] ?? null)) {
            $data['name'] = trim($data['name']);
        }
        abort_if(Validator::make($data, $rules)->fails(), 400);

        return $data;
    }
}
