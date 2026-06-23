<?php

use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Controllers\CsrfCookieController;

Route::get('/', function () {
    return response()->json(['service' => 'YHthestudio Laravel API', 'docs' => '/api/v2/health']);
});

// Sanctum SPA CSRF Cookie
Route::get('/sanctum/csrf-cookie', [CsrfCookieController::class, 'show']);
