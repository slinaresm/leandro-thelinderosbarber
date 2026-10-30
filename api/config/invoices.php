<?php

return [
    'root' => env('INVOICE_FILES_ROOT', storage_path('app/invoices')),
    'legacy_root' => env('LEGACY_INVOICE_UPLOADS_ROOT'),
];
