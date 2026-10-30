<?php

namespace App\Commerce;

class Amounts
{
    public const MAX = 9007199254740991;

    public static function integer(mixed $value, int $status = 400): int
    {
        abort_unless(is_int($value) || (is_string($value) && preg_match('/^(?:0|[1-9][0-9]{0,15})$/D', $value)), $status);
        abort_if((int) $value < 0 || (int) $value > self::MAX, $status);

        return (int) $value;
    }

    public static function add(int $left, int $right, int $status = 400): int
    {
        abort_if($left < 0 || $right < 0 || $left > self::MAX - $right, $status);

        return $left + $right;
    }

    public static function multiply(int $left, int $right, int $status = 400): int
    {
        abort_if($left < 0 || $right < 0 || ($right !== 0 && $left > intdiv(self::MAX, $right)), $status);

        return $left * $right;
    }
}
