<?php

namespace App\Http\Middleware;

use App\Security\JwtSessions;
use Closure;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $service = app(JwtSessions::class);
        $token = $service->token($request);
        abort_unless(is_string($token) && $token !== '', 401);
        $identity = $service->authenticate($token);
        $request->attributes->set('identity', $identity);
        $request->setUserResolver(fn () => new GenericUser(get_object_vars($identity['user'])));

        return $next($request);
    }
}
