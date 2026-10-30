<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('notifications:run tick --limit=100')->everyMinute()->withoutOverlapping(30);
Schedule::command('maintenance:run')->everyFifteenMinutes()->withoutOverlapping(30);
