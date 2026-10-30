<?php

namespace App\Commerce;

use App\Files\InvoiceFiles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

class InvoiceExtraction
{
    public function __construct(private GeminiGateway $gateway, private InvoiceFiles $files) {}

    /** @return array<string,mixed> */
    public function extract(string $actor, UploadedFile $file): array
    {
        $mode = $this->gateway->mode();
        $prepared = $this->files->prepare($file);
        $this->files->stage($prepared);
        try {
            $mime = match (pathinfo($prepared['filename'], PATHINFO_EXTENSION)) {
                'pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'
            };
            $proposal = $this->gateway->invoice($prepared['bytes'], $mime);
            $expires = $this->files->ownDraft($prepared['filename'], $actor, $mode === 'simulate');

            return ['invoiceFileUrl' => '/uploads/invoices/'.$prepared['filename'], ...$proposal, 'requiresReview' => true, 'simulated' => $mode === 'simulate', 'expiresAt' => $expires];
        } catch (Throwable $error) {
            try {
                DB::table('invoice_file_jobs')->where('disk', 'managed')->where('filename', $prepared['filename'])->where('state', 'staged')->update(['state' => 'delete']);
            } catch (Throwable) {
                // Staging durable conserva recuperación si falla la marca de limpieza.
            }
            throw $error;
        }
    }
}
