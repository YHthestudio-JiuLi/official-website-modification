<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PaymentSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPaymentSettingsController extends Controller
{
    public function __construct(private readonly PaymentSettingsService $settings) {}

    public function show(): JsonResponse
    {
        return response()->json($this->settings->get());
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'wallet_address' => ['required', 'string', 'max:255'],
            'network' => ['nullable', 'string', 'max:32'],
            'autoDeleteMinutes' => ['nullable', 'integer', 'min:1'],
            'txVerifyMaxUnderpayUsdt' => ['nullable', 'numeric', 'min:0'],
            'txVerifyMaxAgeHours' => ['nullable', 'integer', 'min:0'],
        ]);

        return response()->json($this->settings->update($data));
    }
}
