<?php

namespace App\Events;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class EventRetention
{
    public function run(): int
    {
        return DB::transaction(function (): int {
            DB::table('event_clock')->where('id', 1)->lockForUpdate()->first();
            $cutoff = CarbonImmutable::now('UTC')->subDay();
            $ids = [];
            foreach (DB::table('agenda_events')->orderBy('id')->limit(1000)->lockForUpdate()->get(['id', 'created_at']) as $event) {
                if (CarbonImmutable::parse($event->created_at, 'UTC')->greaterThanOrEqualTo($cutoff)) {
                    break;
                }
                $ids[] = $event->id;
            }

            return DB::table('agenda_events')->whereIn('id', $ids)->delete();
        }, 3);
    }
}
