<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly OrderService $orders) {}

    public function stats(Request $request): JsonResponse
    {
        return response()->json($this->orders->stats($request->user()));
    }
}
