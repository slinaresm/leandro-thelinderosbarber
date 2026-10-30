<?php

namespace App\Http\Controllers;

use App\Commerce\BusinessAssistant;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssistantController extends Controller
{
    public function chat(Request $request, BusinessAssistant $assistant, RateLimiter $limiter): JsonResponse
    {
        $key = 'assistant:'.hash('sha256', $request->ip());
        if ($limiter->tooManyAttempts($key, 20)) {
            return response()->json(['error' => 'Demasiadas consultas. Intenta más tarde.'], 429)->header('Retry-After', (string) $limiter->availableIn($key));
        }
        $limiter->hit($key, 600);

        return response()->json($assistant->chat($request->all()));
    }
}
