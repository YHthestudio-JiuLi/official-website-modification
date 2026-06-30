<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\OrderService;
use App\Services\Commerce\OrderStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminOrderController extends Controller
{
    public function __construct(private readonly OrderService $orders) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->orders->adminList($request->query('status'), $request->user()));
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'in:'.implode(',', OrderStatus::adminWritableValues())],
        ]);
        $this->orders->adminUpdateStatus($id, $data['status'], $request->user());

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->orders->adminDelete($id, $request->user());

        return response()->json(['success' => true]);
    }

    public function updateTracking(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'trackingNumber' => ['nullable', 'string', 'max:64'],
        ]);
        $order = $this->orders->adminUpdateTracking($id, $data['trackingNumber'] ?? null, $request->user());

        return response()->json(['success' => true, 'order' => $order]);
    }
}
