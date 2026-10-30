<?php

namespace App\Http\Middleware;

use App\Security\CsrfTokens;
use App\Security\JwtSessions;
use Closure;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ApiSecurity
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('requestId', (string) Str::uuid());
        $response = $this->protect($request, $next);
        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('X-Request-ID', $request->attributes->get('requestId'));
        $response->headers->remove('X-Powered-By');
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        return $response;
    }

    private function protect(Request $request, Closure $next): Response
    {
        app(JwtSessions::class)->keys();
        app(CsrfTokens::class)->assertConfigured();
        if ($request->cookies->has('bl_session') && ! is_string($request->cookie('bl_session'))) {
            return response()->json(['error' => 'No autorizado.'], 401);
        }
        $origin = config('jwt.origin');
        if (app()->environment('production') && (! str_starts_with($origin, 'https://') || ! $request->isSecure() || ! in_array(config('cache.default'), ['database', 'redis'], true))) {
            return response()->json(['error' => 'Servicio no disponible.'], 503);
        }
        if ((! $request->isMethodSafe() || $request->is('api/auth/csrf')) && (($request->headers->has('Origin') && $request->header('Origin') !== $origin) || $request->header('Sec-Fetch-Site') === 'cross-site')) {
            return response()->json(['error' => 'Origen de solicitud no permitido.'], 403);
        }
        $limiter = app(RateLimiter::class);
        $ip = hash('sha256', $request->ip());
        if ($limiter->tooManyAttempts('api:'.$ip, 180)) {
            return response()->json(['error' => 'Demasiadas solicitudes.'], 429)->header('Retry-After', (string) $limiter->availableIn('api:'.$ip));
        }
        $limiter->hit('api:'.$ip, 60);
        if (! $request->isMethodSafe()) {
            $pureBearer = ! $request->cookies->has('bl_session') && ! $request->cookies->has('bl_csrf') && $request->bearerToken();
            $anonymousLogout = $request->is('api/auth/logout') && ! $request->cookies->has('bl_session') && ! $request->cookies->has('bl_csrf') && ! $request->bearerToken();
            if ($pureBearer) {
                app(JwtSessions::class)->authenticate($request->bearerToken());
            }
            if (! $pureBearer && ! $anonymousLogout) {
                $cookie = $request->cookie('bl_csrf');
                $header = $request->header('X-CSRF-Token');
                if (! is_string($cookie) || ! is_string($header) || ! hash_equals($cookie, $header) || ! app(CsrfTokens::class)->valid($cookie, $request->cookie('bl_session'))) {
                    return response()->json(['error' => 'Comprobación CSRF inválida.'], 403);
                }
            }
            $maximum = ((($request->is('api/photos') || $request->is('api/purchases/extract')) && $request->isMethod('POST')) || (($request->is('api/products') || $request->is('api/products/*')) && in_array($request->method(), ['POST', 'PATCH'], true))) && str_starts_with(strtolower($request->header('Content-Type', '')), 'multipart/form-data') ? 8388608 + 65536 : 102400;
            if ((int) $request->header('Content-Length', '0') > $maximum || strlen($request->getContent()) > $maximum) {
                return response()->json(['error' => 'Solicitud demasiado grande.'], 413);
            }
            if ($request->isJson()) {
                try {
                    json_decode($request->getContent(), true, 64, JSON_THROW_ON_ERROR);
                } catch (\JsonException $error) {
                    return response()->json(['error' => 'JSON inválido.'], 400);
                }
            }
        }

        return $next($request);
    }
}
