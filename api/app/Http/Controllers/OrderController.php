<?php

namespace App\Http\Controllers;

use App\Commerce\OrderSales;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function __construct(private OrderSales $sales) {}

    public function store(Request $request): JsonResponse
    {
        abort_unless(is_array($request->input('items')), 400);
        $order = $this->sales->create($request->attributes->get('identity')['user'], $request->input('items'));
        $view = $this->sales->view($order, false);

        return response()->json(['order' => ['id' => $order->id, 'buyOrder' => $order->buy_order, 'total' => $order->total, 'status' => $order->status, 'items' => $view['items']]], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $query = DB::table('orders')->where('id', $id);
        $admin = $request->user()->role === 'admin';
        if (! $admin) {
            $query->whereIn('client_id', DB::table('clients')->where('user_id', $request->user()->id)->select('id'));
        }
        $order = $query->first();
        abort_unless($order, $admin ? 404 : 403);

        return response()->json(['order' => $this->sales->view($order, $admin)]);
    }

    public function index(Request $request): JsonResponse
    {
        $admin = $request->user()->role === 'admin';
        $query = DB::table('orders as o');
        if (! $admin) {
            $query->whereIn('o.client_id', DB::table('clients')->where('user_id', $request->user()->id)->select('id'));
        }
        $orders = $query->orderByDesc('o.created_at')->orderBy('o.id')->get(['o.*'])->map(function (object $order) use ($admin): array {
            $view = $this->sales->view($order, $admin);
            if ($admin) {
                $client = DB::table('clients as c')->join('users as u', 'u.id', '=', 'c.user_id')->where('c.id', $order->client_id)->first(['u.name', 'u.email']);
                $view += ['client_name' => $client->name ?? null, 'client_email' => $client->email ?? null];
            }

            return $view;
        });

        return response()->json(['orders' => $orders]);
    }

    public function status(Request $request, string $id): JsonResponse
    {
        abort_unless(is_string($request->input('status')), 400);
        $this->sales->change($request->attributes->get('identity')['user'], $id, $request->input('status'));

        return response()->json(['message' => 'Orden marcada como '.$request->input('status').'.']);
    }

    public function retired(): JsonResponse
    {
        return response()->json(['error' => 'La confirmación externa de pagos no está habilitada. Coordina el pago con la barbería.'], 410);
    }
}
