<?php

namespace App\Http\Controllers;

use App\Events\EventFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Sleep;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class EventController extends Controller
{
    public function __construct(private EventFeed $feed) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->feed->batch($request, (is_string($request->query('cursor')) ? $request->query('cursor') : null)));
    }

    public function stream(Request $request): StreamedResponse
    {
        $initial = $this->feed->batch($request, $request->header('Last-Event-ID') ?? (is_string($request->query('cursor')) ? $request->query('cursor') : null));

        return response()->stream(function () use ($request, $initial): void {
            $batch = $initial;
            $deadline = microtime(true) + max(0, min(15, (int) config('events.stream_seconds', 15)));
            echo "retry: 2000\n\n";
            do {
                echo 'id: '.$batch['cursor']."\nevent: sync\ndata: ".json_encode($batch, JSON_THROW_ON_ERROR)."\n\n";
                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();
                if (connection_aborted() || microtime(true) >= $deadline) {
                    break;
                }
                if (! $batch['more']) {
                    Sleep::for(1)->seconds();
                }
                try {
                    $batch = $this->feed->batch($request, $batch['cursor']);
                } catch (Throwable $error) {
                    $auth = $error instanceof HttpExceptionInterface && in_array($error->getStatusCode(), [401, 403], true);
                    echo 'event: '.($auth ? 'auth.required' : 'sync.failed')."\ndata: {}\n\n";
                    flush();

                    return;
                }
            } while (true);
            echo "event: stream.end\ndata: {}\n\n";
            flush();
        }, 200, ['Content-Type' => 'text/event-stream', 'X-Accel-Buffering' => 'no']);
    }
}
