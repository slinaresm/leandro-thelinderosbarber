<?php

namespace App\Agenda;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReminderSweep
{
    public function instant(object $reservation): CarbonImmutable
    {
        return $reservation->starts_at ? CarbonImmutable::parse($reservation->starts_at, 'UTC') : app(AgendaTime::class)->instant($reservation->date, substr($reservation->start_time, 0, 5));
    }

    /** @return array{checked:int,scheduled:int,invalid:int} */
    public function run(): array
    {
        $now = CarbonImmutable::now('UTC');
        $metrics = ['checked' => 0, 'scheduled' => 0, 'invalid' => 0];
        $local = $now->setTimezone(AgendaTime::ZONE);
        $ids = DB::table('reservations')->where('status', 'confirmed')->whereBetween('date', [$local->format('Y-m-d'), $local->addDays(2)->format('Y-m-d')])->orderBy('id')->pluck('id');
        foreach ($ids as $id) {
            $metrics['checked']++;
            $result = DB::transaction(function () use ($id, $now): string {
                $reservation = DB::table('reservations')->where('id', $id)->lockForUpdate()->first();
                if (! $reservation || $reservation->status !== 'confirmed') {
                    return 'none';
                }
                try {
                    $seconds = $this->instant($reservation)->timestamp - $now->timestamp;
                } catch (Throwable) {
                    return 'invalid';
                }
                if ($seconds <= 0 || $seconds > 86400) {
                    return 'none';
                }
                $hours = $seconds <= 7200 ? 2 : 24;
                $flag = 'notified_'.$hours.'h';
                if ((int) $reservation->$flag === 1) {
                    return 'none';
                }
                app(NotificationOutbox::class)->appointment($reservation, 'recordatorio_'.$hours.'h');
                DB::table('reservations')->where('id', $id)->update([$flag => 1]);

                return 'scheduled';
            }, 3);
            if (isset($metrics[$result])) {
                $metrics[$result]++;
            }
        }

        return $metrics;
    }
}
