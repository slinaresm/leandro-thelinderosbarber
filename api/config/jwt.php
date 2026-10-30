<?php

return [
    'keys' => json_decode(env('JWT_KEYS', '{}'), true, 32, JSON_THROW_ON_ERROR),
    'active_kid' => env('JWT_ACTIVE_KID', ''),
    'issuer' => env('JWT_ISSUER', 'barber-linderos'),
    'audience' => env('JWT_AUDIENCE', 'barber-linderos-web'),
    'ttl' => 28800,
    'origin' => env('SITE_ORIGIN', 'http://localhost:8080'),
];
