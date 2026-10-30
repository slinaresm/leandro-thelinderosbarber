<?php

namespace App\Providers;

use App\Security\JwtSessions;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Auth::viaRequest('jwt', function (Request $request): ?GenericUser {
            $service = app(JwtSessions::class);
            $token = $service->token($request);
            if (! $token) {
                return null;
            }
            $identity = $service->authenticate($token);

            return new GenericUser(get_object_vars($identity['user']));
        });
    }
}
