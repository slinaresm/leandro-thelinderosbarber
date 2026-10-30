<?php

namespace App\Http\Controllers;

use App\Commerce\Amounts;
use App\Commerce\AuditTrail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class InventoryController extends Controller
{
    public function __construct(private AuditTrail $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['items' => DB::table('inventory')->orderBy('quantity')->orderBy('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $name = $request->input('product_name');
        abort_if(Validator::make(['name' => $name], ['name' => ['required', 'string', 'max:200', 'not_regex:/[<>]/']])->fails(), 400);
        $data = ['id' => (string) Str::uuid(), 'product_name' => $name, 'quantity' => Amounts::integer($request->input('quantity', 0)), 'min_threshold' => Amounts::integer($request->input('min_threshold', 5))];
        $item = DB::transaction(function () use ($data, $request): object {
            DB::table('inventory')->insert($data);
            $item = DB::table('inventory')->find($data['id']);
            $this->audit->record($request->user()->id, 'inventory', $item->id, 'created', null, $item);

            return $item;
        }, 3);

        return response()->json(['item' => $item], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->only(['quantity', 'min_threshold', 'request_status']);
        abort_if($data === [], 400);
        foreach (['quantity', 'min_threshold'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = Amounts::integer($data[$field]);
            }
        }
        if (array_key_exists('request_status', $data)) {
            abort_unless(in_array($data['request_status'], ['none', 'pending', 'approved', 'rejected'], true), 400);
        }
        $item = DB::transaction(function () use ($id, $data, $request): object {
            $before = DB::table('inventory')->where('id', $id)->lockForUpdate()->first();
            abort_unless($before, 404);
            DB::table('inventory')->where('id', $id)->update([...$data, 'updated_at' => now('UTC')]);
            $item = DB::table('inventory')->find($id);
            $this->audit->record($request->user()->id, 'inventory', $id, 'updated', $before, $item);

            return $item;
        }, 3);

        return response()->json(['item' => $item]);
    }

    public function requestRestock(Request $request, string $id): JsonResponse
    {
        $barber = DB::table('barbers')->where('user_id', $request->user()->id)->value('id');
        abort_unless($barber, 403);
        $item = DB::transaction(function () use ($id, $barber, $request): object {
            $before = DB::table('inventory')->where('id', $id)->lockForUpdate()->first();
            abort_unless($before, 404);
            if ($before->request_status === 'pending') {
                abort_unless($before->requested_by === $barber, 409);

                return $before;
            }
            DB::table('inventory')->where('id', $id)->update(['requested_by' => $barber, 'request_status' => 'pending', 'updated_at' => now('UTC')]);
            $item = DB::table('inventory')->find($id);
            $this->audit->record($request->user()->id, 'inventory', $id, 'restock.requested', $before, $item);

            return $item;
        }, 3);

        return response()->json(['item' => $item]);
    }
}
