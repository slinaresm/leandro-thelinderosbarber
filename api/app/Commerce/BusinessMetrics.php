<?php

namespace App\Commerce;

use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class BusinessMetrics
{
    private function snapshot(Closure $operation): array
    {
        if (DB::transactionLevel() === 0) {
            DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        }

        return DB::transaction($operation, 3);
    }

    /** @param array<string,mixed> $input
     * @return array{from:?string,to:?string,start:?CarbonImmutable,end:?CarbonImmutable}
     */
    private function period(array $input): array
    {
        abort_if(array_diff(array_keys($input), ['from', 'to']) !== [], 400);
        if ($input === []) {
            return ['from' => null, 'to' => null, 'start' => null, 'end' => null];
        }
        foreach (['from', 'to'] as $field) {
            $date = $input[$field] ?? null;
            abort_unless(is_string($date) && preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/D', $date), 400);
            [$year, $month, $day] = array_map('intval', explode('-', $date));
            abort_unless($year >= 1000 && $year <= 9998 && checkdate($month, $day, $year), 400);
        }
        abort_if($input['from'] > $input['to'], 400);
        $start = CarbonImmutable::parse($input['from'], 'America/Santiago')->startOfDay();
        $last = CarbonImmutable::parse($input['to'], 'America/Santiago')->startOfDay();
        abort_if(CarbonImmutable::parse($input['from'], 'UTC')->diffInDays(CarbonImmutable::parse($input['to'], 'UTC')) > 365, 400);

        return ['from' => $input['from'], 'to' => $input['to'], 'start' => $start->utc(), 'end' => $last->addDay()->startOfDay()->utc()];
    }

    private function dates(Builder $query, array $period): Builder
    {
        if ($period['from'] !== null) {
            $query->whereBetween('r.date', [$period['from'], $period['to']]);
        }

        return $query;
    }

    /** @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public function overview(array $input): array
    {
        $period = $this->period($input);

        return $this->snapshot(function () use ($period): array {
            $base = $this->dates(DB::table('reservations as r')->join('services as s', 's.id', '=', 'r.service_id'), $period);
            $totalRevenue = (clone $base)->where('r.status', 'completed')->selectRaw('COALESCE(SUM(COALESCE(r.service_price_snapshot,s.price)),0) AS revenue')->first()->revenue;
            $totalReservations = (clone $base)->where('r.status', '!=', 'cancelled')->count();
            $cancelled = (clone $base)->where('r.status', 'cancelled')->count();
            $services = (clone $base)->where('r.status', '!=', 'cancelled')->selectRaw('COALESCE(r.service_name_snapshot,s.name) AS name, COUNT(*) AS bookings, SUM(COALESCE(r.service_price_snapshot,s.price)) AS revenue')->groupBy('s.id')->groupByRaw('COALESCE(r.service_name_snapshot,s.name)')->orderByDesc('bookings')->orderBy('name')->orderBy('s.id')->get()->map(fn (object $row): array => ['name' => $row->name, 'bookings' => Amounts::integer($row->bookings, 409), 'revenue' => Amounts::integer($row->revenue, 409)])->all();
            $barbers = $this->dates(DB::table('reservations as r')->join('barbers as b', 'b.id', '=', 'r.barber_id')->join('users as u', 'u.id', '=', 'b.user_id'), $period)->where('r.status', '!=', 'cancelled')->selectRaw("u.name AS barber_name, COUNT(*) AS total_citas, SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completadas")->groupBy('b.id', 'u.name')->orderByDesc('total_citas')->orderBy('u.name')->orderBy('b.id')->get()->map(fn (object $row): array => ['barber_name' => $row->barber_name, 'total_citas' => Amounts::integer($row->total_citas, 409), 'completadas' => Amounts::integer($row->completadas, 409)])->all();
            $today = CarbonImmutable::now('America/Santiago');
            $dayFrom = $period['from'] ?? $today->subDays(14)->format('Y-m-d');
            $dayTo = $period['to'] ?? $today->format('Y-m-d');
            $days = DB::table('reservations')->where('status', '!=', 'cancelled')->whereBetween('date', [$dayFrom, $dayTo])->select('date')->selectRaw('COUNT(*) AS total')->groupBy('date')->orderBy('date')->get()->map(fn (object $row): array => ['date' => $row->date, 'total' => Amounts::integer($row->total, 409)])->all();

            return ['totalRevenue' => Amounts::integer($totalRevenue, 409), 'totalReservations' => Amounts::integer($totalReservations, 409), 'totalClients' => Amounts::integer(DB::table('clients')->count(), 409), 'totalBarbers' => Amounts::integer(DB::table('barbers')->where('active', 1)->count(), 409), 'cancelledCount' => Amounts::integer($cancelled, 409), 'topServices' => $services, 'barberPerformance' => $barbers, 'reservationsByDay' => $days, 'period' => ['from' => $period['from'], 'to' => $period['to'], 'dailyFrom' => $dayFrom, 'dailyTo' => $dayTo, 'timezone' => 'America/Santiago'], 'commerce' => app(CommercialMetrics::class)->summary($period['start'], $period['end'])];
        });
    }

    /** @return array<string,int> */
    public function segments(): array
    {
        return $this->snapshot(function (): array {
            $new = DB::table('clients')->where('created_at', '>=', now('UTC')->subDays(30))->count();
            $inactive = DB::table('clients as c')->whereNotExists(fn (Builder $q) => $q->selectRaw('1')->from('reservations as r')->whereColumn('r.client_id', 'c.id')->where('r.date', '>=', CarbonImmutable::now('America/Santiago')->subDays(60)->format('Y-m-d')))->count();
            $vip = DB::table('clients')->whereIn('loyalty_level', ['Oro', 'Black'])->count();
            $recurrent = DB::query()->fromSub(DB::table('reservations')->where('status', '!=', 'cancelled')->groupBy('client_id')->havingRaw('COUNT(*) >= 3')->select('client_id'), 'recurring')->count();

            return ['nuevos' => Amounts::integer($new, 409), 'inactivos' => Amounts::integer($inactive, 409), 'vip' => Amounts::integer($vip, 409), 'recurrentes' => Amounts::integer($recurrent, 409)];
        });
    }
}
