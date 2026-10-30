<?php

namespace App\Http\Controllers;

use App\Files\ClientDocuments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class NoteController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->only(['client_id', 'content']);
        if (is_string($data['content'] ?? null)) {
            $data['content'] = trim($data['content']);
        }
        abort_if(Validator::make($data, ['client_id' => ['nullable', 'string', 'max:191'], 'content' => ['required', 'string', 'max:10000']])->fails() || $request->has('reservation_id'), 400);
        $note = DB::transaction(function () use ($data, $request): object {
            $barber = app(ClientDocuments::class)->forWrite($request->attributes->get('identity')['user'], $data['client_id'] ?? null);
            $id = (string) Str::uuid();
            DB::table('notes')->insert(['id' => $id, 'barber_id' => $barber->id, 'client_id' => $data['client_id'] ?? null, 'content' => $data['content']]);

            return DB::table('notes')->find($id);
        }, 3);

        return response()->json(['note' => $note], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->only(['clientId']);
        abort_if(Validator::make($data, ['clientId' => ['sometimes', 'string', 'max:191']])->fails(), 400);
        $barberId = DB::table('barbers')->where('user_id', $request->user()->id)->value('id');
        abort_unless($barberId, 403);
        $query = DB::table('notes')->where('barber_id', $barberId);
        if (isset($data['clientId'])) {
            $query->where('client_id', $data['clientId']);
        }

        return response()->json(['notes' => $query->orderByDesc('created_at')->orderBy('id')->get()]);
    }

    public function destroy(Request $request, string $id): Response
    {
        DB::transaction(function () use ($request, $id): void {
            $note = DB::table('notes')->where('id', $id)->lockForUpdate()->first();
            abort_unless($note, 404);
            abort_unless(DB::table('barbers')->where('id', $note->barber_id)->where('user_id', $request->user()->id)->exists(), 403);
            DB::table('notes')->where('id', $id)->delete();
        }, 3);

        return response()->noContent();
    }
}
