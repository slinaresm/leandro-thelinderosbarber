<?php

return [
    'email_mode' => env('NOTIFICATION_EMAIL_MODE', 'simulate'),
    'whatsapp_mode' => env('NOTIFICATION_WHATSAPP_MODE', 'simulate'),
    'smtp' => [
        'host' => env('SMTP_HOST'), 'port' => (int) env('SMTP_PORT', 587),
        'username' => env('SMTP_USER'), 'password' => env('SMTP_PASS'),
        'from' => env('SMTP_FROM'), 'scheme' => env('SMTP_SCHEME', 'smtp'),
    ],
    'whatsapp' => [
        'token' => env('WHATSAPP_CLOUD_API_TOKEN'), 'phone_id' => env('WHATSAPP_CLOUD_PHONE_ID'),
        'version' => env('WHATSAPP_GRAPH_VERSION'), 'language' => env('WHATSAPP_TEMPLATE_LANGUAGE', 'es_CL'),
        'templates' => [
            'confirmacion' => env('WHATSAPP_TEMPLATE_CONFIRMATION'),
            'recordatorio_24h' => env('WHATSAPP_TEMPLATE_REMINDER_24H'),
            'recordatorio_2h' => env('WHATSAPP_TEMPLATE_REMINDER_2H'),
        ],
    ],
];
