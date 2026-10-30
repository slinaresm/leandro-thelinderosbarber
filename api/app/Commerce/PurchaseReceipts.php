<?php

namespace App\Commerce;

use App\Events\AgendaEvents;
use App\Files\InvoiceFiles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class PurchaseReceipts
{
    public function __construct(private AuditTrail $audit, private AgendaEvents $events, private InvoiceFiles $files) {}

    /** @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    private function payload(array $input): array
    {
        $data = ['supplier' => $input['supplier'] ?? null, 'invoiceNumber' => $input['invoiceNumber'] ?? null, 'invoiceFileUrl' => $input['invoiceFileUrl'] ?? null];
        abort_if(Validator::make($data, ['supplier' => ['nullable', 'string', 'max:200'], 'invoiceNumber' => ['nullable', 'string', 'max:200'], 'invoiceFileUrl' => ['nullable', 'string', 'max:200']])->fails(), 400);
        $items = $input['items'] ?? null;
        abort_unless(is_array($items) && array_is_list($items) && count($items) > 0 && count($items) <= 50, 400);
        $seen = [];
        $data['items'] = [];
        foreach ($items as $raw) {
            abort_unless(is_array($raw), 400);
            $quantity = $raw['quantity'] ?? null;
            $cost = $raw['unitCost'] ?? null;
            abort_unless(is_int($quantity) && $quantity > 0 && is_int($cost), 400);
            Amounts::integer($quantity);
            Amounts::integer($cost);
            $productId = $raw['productId'] ?? null;
            if ($productId !== null) {
                abort_unless(is_string($productId) && preg_match('/^[\x21-\x7E]{1,191}$/D', $productId) && ! isset($seen[$productId]), 400);
                $seen[$productId] = true;
            }
            $name = $productId === null ? ($raw['name'] ?? null) : null;
            $category = $productId === null ? ($raw['category'] ?? null) : null;
            abort_if(Validator::make(['name' => $name, 'category' => $category], ['name' => [$productId === null ? 'required' : 'nullable', 'string', 'max:200', 'not_regex:/[<>]/'], 'category' => ['nullable', 'string', 'max:200']])->fails(), 400);
            $data['items'][] = ['productId' => $productId, 'name' => $name, 'category' => $category, 'quantity' => $quantity, 'unitCost' => $cost];
        }
        if ($data['invoiceFileUrl'] !== null) {
            abort_unless(str_starts_with($data['invoiceFileUrl'], '/uploads/invoices/') && $this->files->validName(substr($data['invoiceFileUrl'], 18)), 400);
        }

        return $data;
    }

    /** @param array<string,mixed> $input */
    public function confirm(string $actor, mixed $key, array $input): object
    {
        abort_unless(is_string($key) && preg_match('/^[A-Za-z0-9._:-]{8,128}$/D', $key), 400);
        abort_if(array_key_exists('invoiceReviewed', $input) && ! is_bool($input['invoiceReviewed']), 400);
        $reviewed = ($input['invoiceReviewed'] ?? false) === true;
        $data = $this->payload($input);
        $operation = hash('sha256', $actor."\0".$key);
        $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($actor, $data, $operation, $hash, $reviewed): object {
                DB::table('purchase_operations')->insertOrIgnore(['id' => $operation, 'payload_hash' => $hash]);
                $record = DB::table('purchase_operations')->where('id', $operation)->lockForUpdate()->first();
                abort_unless($record && hash_equals($record->payload_hash, $hash), 409);
                if ($record->purchase_id !== null) {
                    return DB::table('purchases')->find($record->purchase_id);
                }
                $draft = null;
                if ($data['invoiceFileUrl'] !== null) {
                    $this->files->document($data['invoiceFileUrl']);
                    $draft = $this->files->claimDraft($data['invoiceFileUrl'], $actor, $reviewed);
                }
                $ids = array_values(array_filter(array_column($data['items'], 'productId'), fn (mixed $id): bool => $id !== null));
                sort($ids, SORT_STRING);
                $products = [];
                foreach (DB::table('products')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get() as $product) {
                    $products[(string) $product->id] = $product;
                }
                abort_unless(count($products) === count($ids), 404);
                $purchaseId = (string) Str::uuid();
                $lines = [];
                $total = 0;
                foreach ($data['items'] as $item) {
                    $total = Amounts::add($total, Amounts::multiply($item['quantity'], $item['unitCost']));
                    $id = $item['productId'] ?? (string) Str::uuid();
                    $before = $item['productId'] === null ? null : $products[$id];
                    if ($before) {
                        $stock = Amounts::add(Amounts::integer($before->stock, 409), $item['quantity'], 409);
                        DB::table('products')->where('id', $id)->update(['stock' => $stock, 'cost_price' => $item['unitCost'], 'updated_at' => now('UTC')]);
                    } else {
                        $cost = $item['unitCost'];
                        $tens = Amounts::add(Amounts::multiply(intdiv($cost, 10000), 1785), intdiv(($cost % 10000) * 1785 + 5000, 10000));
                        $price = Amounts::multiply($tens, 10);
                        DB::table('products')->insert(['id' => $id, 'name' => $item['name'], 'category' => $item['category'], 'price' => $price, 'cost_price' => $cost, 'stock' => $item['quantity'], 'active' => 1]);
                    }
                    $after = DB::table('products')->find($id);
                    $this->audit->record($actor, 'product', $id, 'purchase.received', $before, $after);
                    $lines[] = ['productId' => $id, 'name' => $after->name, 'quantity' => $item['quantity'], 'unitCost' => $item['unitCost'], 'action' => $before ? 'updated' : 'created'];
                }
                DB::table('purchases')->insert(['id' => $purchaseId, 'supplier' => $data['supplier'], 'invoice_number' => $data['invoiceNumber'], 'invoice_file_url' => $data['invoiceFileUrl'], 'items' => json_encode($lines, JSON_THROW_ON_ERROR), 'total_cost' => $total, 'created_by' => $actor]);
                $this->files->consumeDraft($draft, $purchaseId);
                foreach ($lines as $line) {
                    DB::table('purchase_items')->insert(['id' => (string) Str::uuid(), 'purchase_id' => $purchaseId, 'product_id' => $line['productId'], 'product_name' => $line['name'], 'quantity' => $line['quantity'], 'unit_cost' => $line['unitCost']]);
                    $this->audit->movement($line['productId'], $line['quantity'], $line['unitCost'], 'purchase', $purchaseId, $actor);
                }
                $purchase = DB::table('purchases')->find($purchaseId);
                $this->audit->record($actor, 'purchase', $purchaseId, 'confirmed', null, $purchase);
                DB::table('purchase_operations')->where('id', $operation)->update(['purchase_id' => $purchaseId]);
                $this->events->catalog();

                return $purchase;
            }, 3);
        } catch (QueryException $error) {
            if (in_array($error->errorInfo[1] ?? null, [1205, 1213], true)) {
                abort(409, 'Operación en conflicto; reintenta con la misma clave.');
            }
            throw $error;
        }
    }

    /** @return array<string,mixed> */
    public function view(object $purchase): array
    {
        $lines = DB::table('purchase_items')->where('purchase_id', $purchase->id)->orderBy('id')->get();
        if ($lines->isNotEmpty()) {
            $items = $lines->map(fn (object $line): array => ['productId' => $line->product_id, 'name' => $line->product_name, 'quantity' => $line->quantity, 'unitCost' => $line->unit_cost])->all();
        } else {
            $json = json_decode($purchase->items, true, flags: JSON_THROW_ON_ERROR);
            abort_unless(is_array($json) && array_is_list($json), 409);
            $items = array_map(function (mixed $line): array {
                abort_unless(is_array($line), 409);

                return array_intersect_key($line, array_flip(['productId', 'name', 'quantity', 'unitCost', 'action']));
            }, $json);
        }

        return ['id' => (string) $purchase->id, 'supplier' => $purchase->supplier, 'invoice_number' => $purchase->invoice_number, 'invoice_file_url' => $purchase->invoice_file_url, 'items' => $items, 'total_cost' => $purchase->total_cost, 'created_by' => $purchase->created_by, 'created_at' => $purchase->created_at];
    }
}
