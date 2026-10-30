<?php

namespace App\Commerce;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AuditTrail
{
    public function record(string $actor, string $entityType, string $id, string $action, ?object $before, ?object $after): void
    {
        DB::table('audit_log')->insert(['id' => (string) Str::uuid(), 'actor_user_id' => $actor, 'entity_type' => $entityType, 'entity_id' => $id, 'action' => $action, 'before_data' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR), 'after_data' => $after === null ? null : json_encode($after, JSON_THROW_ON_ERROR)]);
    }

    public function movement(string $productId, int $delta, ?int $cost, string $referenceType, string $referenceId, string $actor): void
    {
        DB::table('stock_movements')->insert(['id' => (string) Str::uuid(), 'product_id' => $productId, 'movement_type' => match ($referenceType) {
            'order' => 'sale', 'purchase' => 'purchase', default => 'adjustment'
        }, 'quantity_delta' => $delta, 'unit_cost' => $cost, 'reference_type' => $referenceType, 'reference_id' => $referenceId, 'created_by' => $actor]);
    }
}
