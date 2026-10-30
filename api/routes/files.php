<?php

use App\Http\Controllers\PhotoController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseController;
use Illuminate\Support\Facades\Route;

Route::get('/uploads/haircuts/{filename}', [PhotoController::class, 'content'])->middleware('jwt');

Route::get('/uploads/products/{filename}', [ProductController::class, 'image']);
Route::get('/uploads/invoices/{filename}', [PurchaseController::class, 'invoice'])->middleware(['jwt', 'role:admin']);
