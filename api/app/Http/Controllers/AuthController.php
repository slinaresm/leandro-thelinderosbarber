<?php

namespace App\Http\Controllers;

use App\Agenda\NotificationOutbox;
use App\Security\CsrfTokens;
use App\Security\JwtSessions;
use Illuminate\Cache\RateLimiter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AuthController extends Controller
{
    public function __construct(private JwtSessions $sessions, private CsrfTokens $csrf) {}

    public function csrf(Request $request): JsonResponse
    {
        $token = $this->csrf->issue($request->cookie('bl_session'));

        return response()->json(['csrfToken' => $token])->withCookie($this->cookie('bl_csrf', $token, $request));
    }

    /** @return array<string, mixed>|null */
    private function input(Request $request, bool $register): ?array
    {
        $data = $request->only($register ? ['name', 'email', 'password', 'phone'] : ['email', 'password']);
        if (is_string($data['email'] ?? null)) {
            $data['email'] = mb_strtolower(trim($data['email']), 'UTF-8');
        }
        if (is_string($data['name'] ?? null)) {
            $data['name'] = trim($data['name']);
        }
        $rules = ['email' => ['required', 'string', 'max:254', 'regex:/^[^\s@]+@[^\s@]+\.[^\s@]+$/u'], 'password' => ['required', 'string', $register ? 'min:12' : 'min:1', function (string $attribute, mixed $value, \Closure $fail): void {
            if (! is_string($value) || strlen($value) > 72 || str_contains($value, "\0")) {
                $fail('Contraseña inválida.');
            }
        }]];
        if ($register) {
            $rules['name'] = ['required', 'string', 'min:2', 'max:100', 'not_regex:/[<>]/'];
            $rules['phone'] = ['nullable', 'string', 'max:32', 'regex:/^[\d +()\-]*$/'];
        }

        return Validator::make($data, $rules)->fails() ? null : $data;
    }

    public function register(Request $request): JsonResponse
    {
        if ($limited = $this->limited('register:'.hash('sha256', $request->ip()), 10, 3600)) {
            return $limited;
        }
        $data = $this->input($request, true);
        if (! $data) {
            return response()->json(['error' => 'Datos de registro inválidos.'], 400);
        }
        try {
            [$user, $token] = DB::transaction(function () use ($data, $request): array {
                $id = (string) Str::uuid();
                $clientId = (string) Str::uuid();
                DB::table('users')->insert(['id' => $id, 'name' => $data['name'], 'email' => $data['email'], 'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT), 'role' => 'cliente', 'phone' => $data['phone'] ?? null]);
                DB::table('clients')->insert(['id' => $clientId, 'user_id' => $id]);
                app(NotificationOutbox::class)->welcome($id);
                $this->replaceSession($request);

                return [['id' => $id, 'name' => $data['name'], 'email' => $data['email'], 'role' => 'cliente', 'clientId' => $clientId], $this->sessions->issue($id)];
            });
        } catch (UniqueConstraintViolationException $error) {
            return response()->json(['error' => 'Ya existe una cuenta con ese email.'], 409);
        }

        return $this->signedResponse($user, $token, $request, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $this->input($request, false);
        if (! $data) {
            return response()->json(['error' => 'Email o contraseña no válidos.'], 400);
        }
        $identityKey = 'login:'.hash('sha256', $request->ip().'|'.$data['email']);
        if ($limited = $this->limited('login-ip:'.hash('sha256', $request->ip()), 100, 900)) {
            return $limited;
        }
        if ($limited = $this->limited($identityKey, 10, 900)) {
            return $limited;
        }
        $user = DB::table('users')->where('email', $data['email'])->whereNull('deleted_at')->first();
        $valid = password_verify($data['password'], $user->password_hash ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if (! $user || ! $valid || ! in_array($user->role, ['admin', 'barbero', 'cliente'], true)) {
            return response()->json(['error' => 'Credenciales inválidas.'], 401);
        }
        $extra = [];
        if ($user->role === 'cliente') {
            $client = DB::table('clients')->where('user_id', $user->id)->first();
            if (! $client) {
                return response()->json(['error' => 'Credenciales inválidas.'], 401);
            }
            $extra = ['clientId' => $client->id, 'loyaltyPoints' => (int) $client->loyalty_points, 'loyaltyLevel' => $client->loyalty_level];
        } elseif ($user->role === 'barbero') {
            $barber = DB::table('barbers')->where('user_id', $user->id)->first();
            if (! $barber) {
                return response()->json(['error' => 'Credenciales inválidas.'], 401);
            }
            $extra = ['barberId' => $barber->id, 'specialty' => $barber->specialty];
        }
        $token = DB::transaction(function () use ($user, $request): string {
            $this->replaceSession($request);

            return $this->sessions->issue($user->id);
        });
        app(RateLimiter::class)->clear($identityKey);

        return $this->signedResponse(['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->role, ...$extra], $token, $request);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->attributes->get('identity')['user']]);
    }

    public function logout(Request $request): Response
    {
        $token = $this->sessions->token($request);
        if ($token !== null) {
            $identity = $this->sessions->authenticate($token);
            $this->sessions->revoke($identity['jti']);
        }

        return response()->noContent()->withCookie($this->cookie('bl_session', '', $request, -1))->withCookie($this->cookie('bl_csrf', '', $request, -1));
    }

    private function replaceSession(Request $request): void
    {
        $token = $this->sessions->token($request);
        if ($token) {
            try {
                $this->sessions->revoke($this->sessions->authenticate($token)['jti']);
            } catch (HttpException $error) {
                if ($error->getStatusCode() !== 401) {
                    throw $error;
                }
            }
        }
    }

    /** @param array<string, mixed> $user */
    private function signedResponse(array $user, string $token, Request $request, int $status = 200): JsonResponse
    {
        return response()->json(['user' => $user], $status)->withCookie($this->cookie('bl_session', $token, $request))->withCookie($this->cookie('bl_csrf', $this->csrf->issue($token), $request));
    }

    private function cookie(string $name, string $value, Request $request, ?int $expires = null): Cookie
    {
        return Cookie::create($name, $value, $expires ?? time() + config('jwt.ttl'), '/', null, app()->environment('production') || $request->isSecure(), true, false, 'lax');
    }

    private function limited(string $key, int $maximum, int $seconds): ?JsonResponse
    {
        $limiter = app(RateLimiter::class);
        if ($limiter->tooManyAttempts($key, $maximum)) {
            return response()->json(['error' => 'Demasiados intentos.'], 429)->header('Retry-After', (string) $limiter->availableIn($key));
        }
        $limiter->hit($key, $seconds);

        return null;
    }
}
