<?php

namespace App\Commerce;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class CommercialMetrics
{
    public function lines(): Builder
    {
        $normal = DB::table('order_items')->select(['order_id', 'product_id', 'quantity', 'unit_price as price', 'unit_cost as cost']);
        $legacy = DB::query()->fromRaw("orders AS o JOIN JSON_TABLE(CASE WHEN JSON_TYPE(o.items) = 'ARRAY' THEN o.items ELSE JSON_ARRAY() END, '$[*]' COLUMNS(line_no FOR ORDINALITY, product_id VARCHAR(191) PATH '$.productId' NULL ON EMPTY NULL ON ERROR)) AS j ON TRUE")
            ->whereNotExists(fn (Builder $query) => $query->selectRaw('1')->from('order_items')->whereColumn('order_items.order_id', 'o.id'))
            ->selectRaw("o.id AS order_id, CASE WHEN JSON_TYPE(JSON_EXTRACT(o.items, CONCAT('$[',j.line_no-1,'].productId'))) = 'STRING' AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(o.items, CONCAT('$[',j.line_no-1,'].productId')))) BETWEEN 1 AND 191 AND j.product_id NOT REGEXP '[^ -~]' THEN CONVERT(j.product_id USING ascii) COLLATE ascii_bin ELSE NULL END AS product_id");
        foreach (['quantity' => ['quantity', 1], 'price' => ['price', 0], 'unitCost' => ['cost', 0]] as $field => [$alias, $minimum]) {
            $value = "JSON_EXTRACT(o.items, CONCAT('$[',j.line_no-1,'].{$field}'))";
            $legacy->selectRaw("CASE WHEN JSON_TYPE({$value}) = 'INTEGER' AND CAST({$value} AS DECIMAL(65,0)) BETWEEN {$minimum} AND 9007199254740991 THEN CAST({$value} AS UNSIGNED) ELSE NULL END AS {$alias}");
        }

        return DB::query()->fromSub($normal->unionAll($legacy), 'l');
    }

    public function sales(): Builder
    {
        return $this->lines()->join('orders as o', 'o.id', '=', 'l.order_id')->where('o.status', 'paid')->whereNotNull('l.product_id')->whereNotNull('l.quantity')->groupBy('l.product_id')->select('l.product_id')->selectRaw('SUM(l.quantity) AS sold');
    }

    private function period(Builder $query, string $column, ?CarbonImmutable $start, ?CarbonImmutable $end): Builder
    {
        if ($start !== null) {
            $query->where($column, '>=', $start->format('Y-m-d H:i:s'))->where($column, '<', $end->format('Y-m-d H:i:s'));
        }

        return $query;
    }

    /** @return array<string,int|null> */
    public function summary(?CarbonImmutable $start, ?CarbonImmutable $end): array
    {
        $orders = $this->period(DB::table('orders')->where('status', 'paid'), 'created_at', $start, $end);
        $orderTotals = (clone $orders)->selectRaw('COUNT(*) AS paid, COALESCE(SUM(total),0) AS revenue')->first();
        $lines = $this->period($this->lines()->join('orders as o', 'o.id', '=', 'l.order_id')->where('o.status', 'paid'), 'o.created_at', $start, $end);
        $lineTotals = $lines->selectRaw('COALESCE(SUM(l.quantity * l.cost),0) AS cost, COALESCE(SUM(CASE WHEN l.cost IS NULL THEN 1 ELSE 0 END),0) AS missing, COALESCE(SUM(CASE WHEN l.quantity IS NULL OR l.price IS NULL THEN 1 ELSE 0 END),0) AS invalid')->first();
        $missingOrders = (clone $orders)->whereNotExists(fn (Builder $q) => $q->selectRaw('1')->fromSub($this->lines(), 'all_lines')->whereColumn('all_lines.order_id', 'orders.id'))->count();
        $revenue = Amounts::integer($orderTotals->revenue, 409);
        $missing = Amounts::integer($lineTotals->missing, 409);
        $invalid = Amounts::integer($lineTotals->invalid, 409);
        $cost = $missing || $invalid || $missingOrders ? null : Amounts::integer($lineTotals->cost, 409);
        $purchaseCost = $this->period(DB::table('purchases'), 'created_at', $start, $end)->sum('total_cost');

        return ['paidOrders' => Amounts::integer($orderTotals->paid, 409), 'revenue' => $revenue, 'costOfSales' => $cost, 'margin' => $cost === null ? null : $revenue - $cost, 'purchaseCost' => Amounts::integer($purchaseCost, 409), 'missingCostLines' => $missing, 'invalidLines' => $invalid, 'missingLineOrders' => Amounts::integer($missingOrders, 409)];
    }
}
