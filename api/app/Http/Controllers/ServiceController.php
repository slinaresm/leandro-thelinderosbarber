<?php

namespace App\Http\Controllers;

use App\Events\AgendaEvents;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ServiceController extends Controller
{
    public function all(Request $request): JsonResponse
    {
        abort_if($request->query() !== [], 400);

        return response()->json(['services' => DB::table('services')->orderByDesc('active')->orderBy('price')->orderBy('id')->get(['id', 'name', 'description', 'price', 'duration_minutes', 'active'])]);
    }

    public function index(): JsonResponse
    {
        return response()->json(['services' => DB::table('services')->where('active', 1)->orderBy('price')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->input($request, true);
        $id = (string) Str::uuid();
        DB::transaction(function () use ($id, $data): void {
            DB::table('services')->insert(['id' => $id, ...$data]);
            app(AgendaEvents::class)->catalog();
        }, 3);

        return response()->json(['service' => DB::table('services')->find($id)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, false);
        $service = DB::transaction(function () use ($id, $data): object {
            abort_unless(DB::table('services')->where('id', $id)->lockForUpdate()->first(), 404);
            if ($data !== []) {
                DB::table('services')->where('id', $id)->update($data);
                app(AgendaEvents::class)->catalog();
            }

            return DB::table('services')->find($id);
        }, 3);

        return response()->json(['service' => $service]);
    }

    public function destroy(string $id): Response
    {
        DB::transaction(function () use ($id): void {
            if (DB::table('services')->where('id', $id)->update(['active' => 0])) {
                app(AgendaEvents::class)->catalog();
            }
        }, 3);

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function input(Request $request, bool $create): array
    {
        $data = $request->only(['name', 'price', 'duration_minutes', 'description', 'active']);
        $presence = $create ? 'required' : 'sometimes';
        abort_if(Validator::make($data, [
            'name' => [$presence, 'string', 'min:1', 'max:200', 'not_regex:/[<>]/'],
            'price' => [$presence, 'integer', 'min:0', 'max:9007199254740991'],
            'duration_minutes' => [$presence, 'integer', 'min:1', 'max:780'],
            'description' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'active' => ['sometimes', 'boolean'],
        ])->fails(), 400);

        return $data;
    }
}
