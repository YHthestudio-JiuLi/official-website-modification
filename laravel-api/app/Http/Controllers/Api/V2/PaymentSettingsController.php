<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PaymentSettingsService;
use Illuminate\Http\JsonResponse;

class PaymentSettingsController extends Controller
{
    public function __construct(private readonly PaymentSettingsService $settings) {}

    public function show(): JsonResponse
    {
        return response()->json($this->settings->getPublic());
    }
}
