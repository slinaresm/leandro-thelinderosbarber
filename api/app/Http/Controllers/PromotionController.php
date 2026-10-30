<?php

namespace App\Http\Controllers;

use App\Commerce\AuditTrail;
use App\Commerce\BusinessMetrics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class PromotionController extends Controller
{
    public function __construct(private AuditTrail $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['promotions' => DB::table('promotions')->orderByDesc('created_at')->orderBy('id')->get()]);
    }

    /** @return array<string,mixed> */
    private function input(Request $request, bool $create): array
    {
        $data = $request->all();
        abort_if(array_diff(array_keys($data), ['title', 'description', 'segment', 'active']) !== [] || $data === [], 400);
        abort_if(Validator::make($data, [
            'title' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:200', 'not_regex:/[<>]/'],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000', 'not_regex:/[<>]/'],
            'segment' => [$create ? 'required' : 'sometimes', 'string', 'in:nuevos,recurrentes,inactivos,vip,cumpleanos,todos'],
        ])->fails(), 400);
        if (array_key_exists('active', $data)) {
            abort_unless(is_bool($data['active']), 400);
        }

        return $data;
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->input($request, true);
        $row = DB::transaction(function () use ($request, $data): object {
            $id = (string) Str::uuid();
            DB::table('promotions')->insert(['id' => $id, ...$data]);
            $row = DB::table('promotions')->find($id);
            $this->audit->record($request->user()->id, 'promotion', $id, 'created', null, $row);

            return $row;
        }, 3);

        return response()->json(['promotion' => $row], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, false);
        $row = DB::transaction(function () use ($request, $id, $data): object {
            $before = DB::table('promotions')->where('id', $id)->lockForUpdate()->first();
            abort_unless($before, 404);
            DB::table('promotions')->where('id', $id)->update($data);
            $row = DB::table('promotions')->find($id);
            $this->audit->record($request->user()->id, 'promotion', $id, 'updated', $before, $row);

            return $row;
        }, 3);

        return response()->json(['promotion' => $row]);
    }

    public function segments(Request $request, BusinessMetrics $metrics): JsonResponse
    {
        abort_if($request->query() !== [], 400);

        return response()->json(['segments' => $metrics->segments()]);
    }
}
