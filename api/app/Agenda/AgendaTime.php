<?php

namespace App\Agenda;

use Carbon\CarbonImmutable;
use DateTimeImmutable;
use DateTimeZone;

class AgendaTime
{
    public const ZONE = 'America/Santiago';

    public function minutes(string $time): int
    {
        abort_unless(preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $time), 400);

        return (int) substr($time, 0, 2) * 60 + (int) substr($time, 3, 2);
    }

    public function hhmm(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    public function date(string $date): void
    {
        abort_unless(preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/D', $date), 400);
        [$year, $month, $day] = array_map('intval', explode('-', $date));
        abort_unless($year >= 1000 && checkdate($month, $day, $year), 400);
        abort_if($date < CarbonImmutable::now(self::ZONE)->format('Y-m-d'), 400);
    }

    public function instant(string $date, string $time): CarbonImmutable
    {
        $this->minutes($time);
        abort_unless(preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/D', $date), 400);
        [$year, $month, $day] = array_map('intval', explode('-', $date));
        abort_unless($year >= 1000 && checkdate($month, $day, $year), 400);
        $text = $date.' '.$time.':00';
        $wall = new DateTimeImmutable($text, new DateTimeZone('UTC'));
        $zone = new DateTimeZone(self::ZONE);
        $offsets = array_unique(array_column($zone->getTransitions($wall->getTimestamp() - 172800, $wall->getTimestamp() + 172800), 'offset'));
        $matches = [];
        foreach ($offsets as $offset) {
            $candidate = $wall->getTimestamp() - $offset;
            if ((new DateTimeImmutable('@'.$candidate))->setTimezone($zone)->format('Y-m-d H:i:s') === $text) {
                $matches[] = $candidate;
            }
        }
        abort_unless(count($matches) === 1, 400);

        return CarbonImmutable::createFromTimestampUTC($matches[0]);
    }

    /** @return array{0:int, 1:int} */
    public function hours(object $barber): array
    {
        $open = max(540, $this->minutes(substr($barber->work_start ?? '09:00', 0, 5)));
        $close = min(1320, $this->minutes(substr($barber->work_end ?? '22:00', 0, 5)));
        abort_unless($open < $close, 409);

        return [$open, $close];
    }

    /** @return array<string, string> */
    public function interval(object $barber, string $date, string $startTime, int $duration): array
    {
        $this->date($date);
        $start = $this->minutes($startTime);
        [$open, $close] = $this->hours($barber);
        abort_if($duration < 1 || $start < $open || $start + $duration > $close, 409);
        $endTime = $this->hhmm($start + $duration);
        $instant = $this->instant($date, $startTime);
        $end = $this->instant($date, $endTime);
        abort_unless($instant->greaterThan(CarbonImmutable::now('UTC')), 400);

        return ['date' => $date, 'start_time' => $startTime, 'end_time' => $endTime, 'starts_at' => $instant->format('Y-m-d H:i:s'), 'ends_at' => $end->format('Y-m-d H:i:s')];
    }
}
