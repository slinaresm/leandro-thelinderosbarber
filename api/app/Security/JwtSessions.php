<?php

namespace App\Security;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class JwtSessions
{
    /** @return array<string, Key> */
    public function keys(): array
    {
        $keys = [];
        foreach (config('jwt.keys') as $id => $encoded) {
            $secret = is_string($encoded) ? base64_decode($encoded, true) : false;
            if (! is_string($id) || ! preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $id) || $secret === false || strlen($secret) < 32) {
                throw new HttpException(503);
            }
            $keys[$id] = new Key($secret, 'HS256');
        }
        if (! isset($keys[config('jwt.active_kid')])) {
            throw new HttpException(503);
        }

        return $keys;
    }

    public function token(Request $request): ?string
    {
        if ($request->cookies->has('bl_session')) {
            return $request->cookie('bl_session');
        }

        return $request->bearerToken();
    }

    public function issue(string $userId): string
    {
        $keys = $this->keys();
        $now = time();
        $claims = ['sub' => $userId, 'jti' => bin2hex(random_bytes(32)), 'iss' => config('jwt.issuer'), 'aud' => config('jwt.audience'), 'iat' => $now, 'nbf' => $now, 'exp' => $now + config('jwt.ttl')];
        $kid = config('jwt.active_kid');
        $token = JWT::encode($claims, $keys[$kid]->getKeyMaterial(), 'HS256', $kid);
        DB::table('jwt_sessions')->insert(['jti' => $claims['jti'], 'user_id' => $userId, 'expires_at' => gmdate('Y-m-d H:i:s', $claims['exp']), 'created_at' => gmdate('Y-m-d H:i:s', $now)]);

        return $token;
    }

    /** @return array{user: object, jti: string} */
    public function authenticate(string $token): array
    {
        $keys = $this->keys();
        try {
            if (strlen($token) > 8192) {
                throw new \UnexpectedValueException;
            }
            $claims = JWT::decode($token, $keys);
            foreach (['iat', 'nbf', 'exp'] as $claim) {
                if (! isset($claims->$claim) || ! is_int($claims->$claim)) {
                    throw new \UnexpectedValueException;
                }
            }
            if (! is_string($claims->sub ?? null) || ! is_string($claims->jti ?? null) || ! preg_match('/^[a-f0-9]{64}$/', $claims->jti) || ($claims->iss ?? null) !== config('jwt.issuer') || ($claims->aud ?? null) !== config('jwt.audience') || $claims->iat > time() || $claims->nbf < $claims->iat || $claims->exp <= $claims->iat || $claims->exp - $claims->iat > config('jwt.ttl')) {
                throw new \UnexpectedValueException;
            }
        } catch (\Throwable $error) {
            throw new HttpException(401);
        }
        $session = DB::table('jwt_sessions')->where('jti', $claims->jti)->where('user_id', $claims->sub)->whereNull('revoked_at')->where('expires_at', '>', gmdate('Y-m-d H:i:s'))->first();
        $user = DB::table('users')->where('id', $claims->sub)->whereNull('deleted_at')->first(['id', 'name', 'email', 'role', 'phone']);
        if (! $session || ! $user || ! in_array($user->role, ['admin', 'barbero', 'cliente'], true)) {
            throw new HttpException(401);
        }

        return ['user' => $user, 'jti' => $claims->jti];
    }

    public function revoke(string $jti): void
    {
        DB::table('jwt_sessions')->where('jti', $jti)->update(['revoked_at' => gmdate('Y-m-d H:i:s')]);
    }
}
