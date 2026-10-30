<?php

namespace App\Commerce;

use App\Events\AgendaEvents;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderSales
{
    /** @param array<int, mixed> $items */
    public function create(object $user, array $items): object
    {
        abort_unless($user->role === 'cliente', 403);
        abort_if($items === [] || ! array_is_list($items) || count($items) > 50, 400);
        $quantities = [];
        foreach ($items as $item) {
            abort_unless(is_array($item) && is_string($item['productId'] ?? null) && strlen($item['productId']) >= 1 && strlen($item['productId']) <= 191 && is_int($item['quantity'] ?? null) && $item['quantity'] > 0 && $item['quantity'] <= Amounts::MAX, 400);
            abort_if(isset($quantities[$item['productId']]), 400);
            $quantities[$item['productId']] = $item['quantity'];
        }
        ksort($quantities, SORT_STRING);

        return $this->transaction(function () use ($user, $quantities): object {
            $client = DB::table('clients')->where('user_id', $user->id)->first();
            abort_unless($client, 403);
            $products = DB::table('products')->whereIn('id', array_keys($quantities))->orderBy('id')->sharedLock()->get()->keyBy('id');
            $lines = [];
            $total = 0;
            foreach ($quantities as $productId => $quantity) {
                $productId = (string) $productId;
                $product = $products->get($productId);
                abort_unless($product && (int) $product->active === 1, 404);
                abort_if((int) $product->stock < $quantity, 409);
                $price = Amounts::integer($product->price);
                $cost = $product->cost_price === null ? null : Amounts::integer($product->cost_price);
                $total = Amounts::add($total, Amounts::multiply($price, $quantity));
                $lines[] = ['productId' => $productId, 'name' => $product->name, 'price' => $price, 'quantity' => $quantity, 'unitCost' => $cost];
            }
            abort_if($total < 1, 400);
            $id = (string) Str::uuid();
            DB::table('orders')->insert(['id' => $id, 'client_id' => $client->id, 'buy_order' => 'BL'.strtoupper(bin2hex(random_bytes(12))), 'session_id' => $id, 'items' => json_encode($lines, JSON_THROW_ON_ERROR), 'total' => $total, 'status' => 'pending']);
            $this->insertLines($id, $lines);
            $order = DB::table('orders')->find($id);
            app(AuditTrail::class)->record($user->id, 'order', $id, 'created', null, (object) ['status' => 'pending', 'total' => $total]);
            app(AgendaEvents::class)->order($order);

            return $order;
        });
    }

    /** @param array<int, array<string, mixed>> $lines */
    private function insertLines(string $id, array $lines): void
    {
        foreach ($lines as $line) {
            DB::table('order_items')->insert(['id' => (string) Str::uuid(), 'order_id' => $id, 'product_id' => $line['productId'], 'product_name' => $line['name'], 'unit_price' => $line['price'], 'quantity' => $line['quantity'], 'unit_cost' => $line['unitCost'] ?? null]);
        }
    }

    public function external(object $order): bool
    {
        foreach (['mp_preference_id', 'mp_payment_id', 'webpay_token', 'payment_detail'] as $field) {
            if (($order->$field ?? null) !== null && $order->$field !== '') {
                return true;
            }
        }

        return false;
    }

    /** @return array<int, array<string, mixed>> */
    public function lines(object $order): array
    {
        $rows = DB::table('order_items')->where('order_id', $order->id)->orderBy('created_at')->orderBy('id')->get();
        if ($rows->isNotEmpty()) {
            return $rows->map(fn (object $row) => ['productId' => $row->product_id, 'name' => $row->product_name, 'price' => $row->unit_price, 'quantity' => $row->quantity, 'unitCost' => $row->unit_cost])->all();
        }
        $decoded = json_decode($order->items, true, flags: JSON_THROW_ON_ERROR);
        abort_unless(is_array($decoded) && array_is_list($decoded), 409);

        foreach ($decoded as $line) {
            abort_unless(is_array($line), 409);
        }

        return $decoded;
    }

    /** @return array<string, mixed> */
    public function view(object $order, bool $admin): array
    {
        $lines = array_map(function (array $line) use ($admin): array {
            $item = ['productId' => $line['productId'] ?? null, 'name' => $line['name'] ?? null, 'price' => $line['price'] ?? null, 'quantity' => $line['quantity'] ?? null];
            if ($admin) {
                $item['unitCost'] = $line['unitCost'] ?? null;
            }

            return $item;
        }, $this->lines($order));
        $external = $this->external($order);

        return ['id' => $order->id, 'client_id' => $order->client_id, 'buy_order' => $order->buy_order, 'total' => $order->total, 'status' => $order->status, 'items' => $lines, 'created_at' => $order->created_at, 'updated_at' => $order->updated_at, 'paymentMode' => $external ? 'legacy-external' : 'manual', 'requiresReconciliation' => $external && $order->status === 'pending'];
    }

    public function change(object $user, string $id, string $status): void
    {
        abort_unless($user->role === 'admin', 403);
        abort_unless(in_array($status, ['paid', 'cancelled'], true), 400);
        $this->transaction(function () use ($user, $id, $status): void {
            $order = DB::table('orders')->where('id', $id)->lockForUpdate()->first();
            abort_unless($order, 404);
            abort_unless($order->status === 'pending' && ! $this->external($order), 409);
            if ($status === 'paid') {
                $lines = $this->lines($order);
                abort_if($lines === [] || count($lines) > 1000, 409);
                $quantities = [];
                $total = 0;
                foreach ($lines as $line) {
                    abort_unless(is_string($line['productId'] ?? null) && $line['productId'] !== '' && is_string($line['name'] ?? null), 409);
                    $quantity = Amounts::integer($line['quantity'] ?? null, 409);
                    abort_if($quantity < 1, 409);
                    $price = Amounts::integer($line['price'] ?? null, 409);
                    if (($line['unitCost'] ?? null) !== null) {
                        Amounts::integer($line['unitCost'], 409);
                    }
                    $total = Amounts::add($total, Amounts::multiply($price, $quantity, 409), 409);
                    $quantities[$line['productId']] = Amounts::add($quantities[$line['productId']] ?? 0, $quantity, 409);
                }
                abort_unless($total > 0 && $total === (int) $order->total, 409);
                ksort($quantities, SORT_STRING);
                $products = DB::table('products')->whereIn('id', array_keys($quantities))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                foreach ($quantities as $productId => $quantity) {
                    $product = $products->get($productId);
                    abort_unless($product && (int) $product->stock >= $quantity, 409);
                    DB::table('products')->where('id', $productId)->update(['stock' => (int) $product->stock - $quantity, 'updated_at' => now('UTC')->format('Y-m-d H:i:s.u')]);
                }
                if (! DB::table('order_items')->where('order_id', $id)->exists()) {
                    $this->insertLines($id, $lines);
                }
                foreach ($lines as $line) {
                    app(AuditTrail::class)->movement($line['productId'], -((int) $line['quantity']), isset($line['unitCost']) ? (int) $line['unitCost'] : null, 'order', $id, $user->id);
                }
            }
            DB::table('orders')->where('id', $id)->update(['status' => $status, 'updated_at' => now('UTC')->format('Y-m-d H:i:s.u')]);
            app(AuditTrail::class)->record($user->id, 'order', $id, $status, (object) ['status' => 'pending', 'total' => $order->total], (object) ['status' => $status, 'total' => $order->total]);
            $updated = DB::table('orders')->find($id);
            if ($status === 'paid') {
                app(AgendaEvents::class)->catalog();
            }
            app(AgendaEvents::class)->order($updated);
        });
    }

    private function transaction(Closure $operation): mixed
    {
        try {
            return DB::transaction($operation, 3);
        } catch (QueryException $error) {
            if (in_array((int) ($error->errorInfo[1] ?? 0), [1205, 1213], true)) {
                abort(409);
            }
            throw $error;
        }
    }
}
