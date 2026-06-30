<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\OrderDashboardStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly OrderDashboardStatsService $orderStats) {}

    public function stats(Request $request): JsonResponse
    {
        return response()->json($this->orderStats->stats($request->user()));
    }
}
