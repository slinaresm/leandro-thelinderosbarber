<?php

return [
    'mode' => env('AI_MODE', 'disabled'),
    'key' => env('GEMINI_API_KEY'),
    'chat_model' => env('GEMINI_MODEL_CHAT'),
    'invoice_model' => env('GEMINI_MODEL_INVOICE'),
];
