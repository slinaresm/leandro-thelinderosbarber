<?php

use App\Http\Middleware\ApiSecurity;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Middleware\RequireRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        then: function (): void {
            require __DIR__.'/../routes/files.php';
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->remove(HandleCors::class);
        $middleware->prepend(ApiSecurity::class);
        $middleware->alias(['jwt' => AuthenticateJwt::class, 'role' => RequireRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->report(function (Throwable $error): void {
            Log::warning('api_failure', ['kind' => $error::class, 'requestId' => request()->attributes->get('requestId')]);
        })->stop();
        $exceptions->render(function (Throwable $error) {
            $status = $error instanceof HttpExceptionInterface ? $error->getStatusCode() : 500;
            $message = [400 => 'Solicitud inválida.', 401 => 'No autorizado.', 403 => 'Acceso denegado.', 404 => 'Recurso no encontrado.', 405 => 'Método no permitido.', 409 => 'Conflicto con los datos existentes.', 413 => 'Solicitud demasiado grande.', 429 => 'Demasiadas solicitudes.', 502 => 'Respuesta externa inválida.', 503 => 'Servicio no disponible.', 504 => 'Tiempo de espera agotado.'][$status] ?? 'Error interno del servidor.';

            return response()->json(['error' => $message], $status);
        });
    })->create();
