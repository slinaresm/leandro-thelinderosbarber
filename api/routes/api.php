<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AssistantController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BarberController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PhotoController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PromotionController;
use App\Http\Controllers\PublicConfigController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\ReservationController;
use App\Http\Controllers\ServiceController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    DB::select('SELECT 1');

    return response()->json(['status' => 'ok', 'service' => 'BARBER LINDEROS API', 'dbDriver' => DB::connection()->getDriverName()]);
})->name('health');

Route::get('/auth/csrf', [AuthController::class, 'csrf'])->name('auth.csrf');
Route::post('/auth/register', [AuthController::class, 'register'])->name('auth.register');
Route::post('/auth/login', [AuthController::class, 'login'])->name('auth.login');
Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('jwt')->name('auth.me');

Route::middleware(['jwt', 'role:admin'])->group(function (): void {
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::post('/users', [AdminUserController::class, 'store']);
    Route::patch('/users/{id}', [AdminUserController::class, 'update']);
    Route::patch('/users/{id}/password', [AdminUserController::class, 'password']);
    Route::patch('/users/{id}/status', [AdminUserController::class, 'status']);
    Route::delete('/users/{id}', [AdminUserController::class, 'destroy']);
});

Route::get('/services', [ServiceController::class, 'index']);
Route::get('/services/admin/all', [ServiceController::class, 'all'])->middleware(['jwt', 'role:admin']);
Route::post('/services', [ServiceController::class, 'store'])->middleware(['jwt', 'role:admin']);
Route::patch('/services/{id}', [ServiceController::class, 'update'])->middleware(['jwt', 'role:admin']);
Route::delete('/services/{id}', [ServiceController::class, 'destroy'])->middleware(['jwt', 'role:admin']);
Route::get('/barbers', [BarberController::class, 'index']);
Route::get('/barbers/admin/all', [BarberController::class, 'all'])->middleware(['jwt', 'role:admin']);
Route::get('/barbers/me/profile', [BarberController::class, 'me'])->middleware(['jwt', 'role:barbero']);
Route::post('/barbers', [BarberController::class, 'store'])->middleware(['jwt', 'role:admin']);
Route::patch('/barbers/{id}', [BarberController::class, 'update'])->middleware(['jwt', 'role:admin,barbero']);
Route::get('/barbers/{id}/clients', [BarberController::class, 'clients'])->middleware(['jwt', 'role:admin,barbero']);
Route::get('/barbers/{id}/stats', [BarberController::class, 'stats'])->middleware(['jwt', 'role:admin,barbero']);
Route::get('/reservations/availability', [ReservationController::class, 'availability']);
Route::get('/reservations', [ReservationController::class, 'index'])->middleware('jwt');
Route::post('/reservations', [ReservationController::class, 'store'])->middleware(['jwt', 'role:cliente']);
Route::patch('/reservations/{id}/cancel', [ReservationController::class, 'cancel'])->middleware('jwt');
Route::patch('/reservations/{id}/reschedule', [ReservationController::class, 'reschedule'])->middleware('jwt');
Route::patch('/reservations/{id}/complete', [ReservationController::class, 'complete'])->middleware(['jwt', 'role:admin,barbero']);

Route::get('/events', [EventController::class, 'index']);
Route::get('/events/stream', [EventController::class, 'stream']);

Route::get('/clients', [ClientController::class, 'index'])->middleware(['jwt', 'role:admin']);
Route::get('/clients/me/profile', [ClientController::class, 'me'])->middleware(['jwt', 'role:cliente']);
Route::get('/clients/{id}', [ClientController::class, 'show'])->middleware(['jwt', 'role:admin,cliente']);
Route::get('/clients/{id}/history', [ClientController::class, 'history'])->middleware(['jwt', 'role:admin,cliente,barbero']);

Route::post('/notes', [NoteController::class, 'store'])->middleware(['jwt', 'role:barbero']);
Route::get('/notes', [NoteController::class, 'index'])->middleware(['jwt', 'role:barbero']);
Route::delete('/notes/{id}', [NoteController::class, 'destroy'])->middleware(['jwt', 'role:barbero']);
Route::post('/photos', [PhotoController::class, 'store'])->middleware(['jwt', 'role:barbero']);
Route::get('/photos', [PhotoController::class, 'index'])->middleware('jwt');
Route::delete('/photos/{id}', [PhotoController::class, 'destroy'])->middleware(['jwt', 'role:admin,barbero']);

Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/admin/all', [ProductController::class, 'all'])->middleware(['jwt', 'role:admin']);
Route::get('/products/admin/inventory-summary', [ProductController::class, 'summary'])->middleware(['jwt', 'role:admin']);
Route::get('/products/admin/movements', [ProductController::class, 'movements'])->middleware(['jwt', 'role:admin']);
Route::post('/products', [ProductController::class, 'store'])->middleware(['jwt', 'role:admin']);
Route::patch('/products/{id}', [ProductController::class, 'update'])->middleware(['jwt', 'role:admin']);
Route::delete('/products/{id}', [ProductController::class, 'destroy'])->middleware(['jwt', 'role:admin']);
Route::get('/products/{id}', [ProductController::class, 'show']);
Route::get('/orders/mercadopago/return', [OrderController::class, 'retired']);
Route::post('/orders/mercadopago/webhook', [OrderController::class, 'retired']);
Route::post('/orders', [OrderController::class, 'store'])->middleware(['jwt', 'role:cliente']);
Route::get('/orders', [OrderController::class, 'index'])->middleware(['jwt', 'role:admin,cliente']);
Route::get('/orders/{id}', [OrderController::class, 'show'])->middleware(['jwt', 'role:admin,cliente']);
Route::patch('/orders/{id}/status', [OrderController::class, 'status'])->middleware(['jwt', 'role:admin']);

Route::get('/inventory', [InventoryController::class, 'index'])->middleware(['jwt', 'role:admin,barbero']);
Route::post('/inventory', [InventoryController::class, 'store'])->middleware(['jwt', 'role:admin']);
Route::patch('/inventory/{id}', [InventoryController::class, 'update'])->middleware(['jwt', 'role:admin']);
Route::post('/inventory/{id}/request', [InventoryController::class, 'requestRestock'])->middleware(['jwt', 'role:barbero']);
Route::get('/purchases', [PurchaseController::class, 'index'])->middleware(['jwt', 'role:admin']);
Route::post('/purchases/confirm', [PurchaseController::class, 'confirm'])->middleware(['jwt', 'role:admin']);

Route::post('/assistant/chat', [AssistantController::class, 'chat']);
Route::post('/purchases/extract', [PurchaseController::class, 'extract'])->middleware(['jwt', 'role:admin']);

Route::get('/promotions', [PromotionController::class, 'index'])->middleware(['jwt', 'role:admin']);
Route::post('/promotions', [PromotionController::class, 'store'])->middleware(['jwt', 'role:admin']);
Route::patch('/promotions/{id}', [PromotionController::class, 'update'])->middleware(['jwt', 'role:admin']);
Route::get('/promotions/segments/counts', [PromotionController::class, 'segments'])->middleware(['jwt', 'role:admin']);
Route::get('/analytics/overview', [AnalyticsController::class, 'overview'])->middleware(['jwt', 'role:admin']);
Route::get('/config', [PublicConfigController::class, 'index']);
