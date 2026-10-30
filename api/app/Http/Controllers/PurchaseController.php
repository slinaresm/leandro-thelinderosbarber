<?php

namespace App\Http\Controllers;

use App\Commerce\InvoiceExtraction;
use App\Commerce\PurchaseReceipts;
use App\Files\InvoiceFiles;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PurchaseController extends Controller
{
    public function __construct(private PurchaseReceipts $receipts, private InvoiceFiles $files) {}

    public function index(): JsonResponse
    {
        return response()->json(['purchases' => DB::table('purchases')->orderByDesc('created_at')->orderBy('id')->get()->map(fn (object $purchase): array => $this->receipts->view($purchase))]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $purchase = $this->receipts->confirm($request->user()->id, $request->header('Idempotency-Key'), $request->all());

        return response()->json(['purchase' => $this->receipts->view($purchase)], 201);
    }

    public function invoice(Request $request, string $filename): BinaryFileResponse
    {
        abort_unless($this->files->validName($filename), 404);
        $url = '/uploads/invoices/'.$filename;
        abort_unless(DB::table('purchases')->where('invoice_file_url', $url)->exists() || $this->files->readableDraft($filename, $request->user()->id), 404);
        $document = $this->files->document($url);

        return response()->download($document['path'], $filename, ['Content-Type' => $document['mime'], 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'no-store, private']);
    }

    public function extract(Request $request, InvoiceExtraction $extraction, RateLimiter $limiter): JsonResponse
    {
        $key = 'invoice-extract:'.hash('sha256', $request->user()->id);
        if ($limiter->tooManyAttempts($key, 10)) {
            return response()->json(['error' => 'Demasiadas extracciones. Intenta más tarde.'], 429)->header('Retry-After', (string) $limiter->availableIn($key));
        }
        $limiter->hit($key, 600);
        $file = $request->file('invoice');
        abort_unless($file instanceof UploadedFile && count($request->allFiles()) === 1 && array_diff(array_keys($request->all()), ['invoice']) === [], 400);
        if ($file->getError() === UPLOAD_ERR_INI_SIZE || $file->getError() === UPLOAD_ERR_FORM_SIZE) {
            abort(413);
        }

        return response()->json($extraction->extract($request->user()->id, $file));
    }
}
