<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Bridge\NodeTelegramNotifier;
use App\Services\Commerce\OrderService;
use App\Services\Commerce\PaymentSettingsService;
use App\Services\Commerce\SfExpressTrackingService;
use App\Services\Commerce\UsdtTxVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly NodeTelegramNotifier $telegram,
        private readonly SfExpressTrackingService $sfTracking,
        private readonly UsdtTxVerificationService $txVerify,
        private readonly PaymentSettingsService $paymentSettings,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->orders->listForUser($request->user()->id));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = $this->orders->findForUser($id, $request->user()->id);
        if (! $order) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'shippingAddress' => ['required', 'string'],
            'txHash' => ['required', 'string', 'max:255'],
            'configId' => ['nullable', 'string', 'max:64'],
        ]);
        $user = $request->user();
        $result = $this->orders->createPaidForUser($user->id, $user->username, $data);
        if (! empty($result['order'])) {
            $this->telegram->notifyOrderPaid($result['order']);
        }

        return response()->json([
            'success' => true,
            'orderId' => $result['orderId'],
            'order' => $result['order'],
        ]);
    }

    public function confirm(Request $request, int $id): JsonResponse
    {
        $result = $this->orders->confirmPayment($id, $request->user()->id, $request->all());

        if ($result['deleted'] ?? false) {
            $locale = strtolower((string) $request->header('Accept-Language', 'zh'));
            $reason = (string) ($result['reason'] ?? '');
            $rules = $this->paymentSettings->txVerifyRules();
            $expected = (float) ($result['expected_amount'] ?? 0);
            $paid = isset($result['paid_amount']) ? (float) $result['paid_amount'] : null;
            $message = str_starts_with($locale, 'en')
                ? $this->txVerify->messageForReason($reason, $expected, $paid, $rules['maxUnderpayUsdt'], $rules['maxAgeHours'])
                : $this->txVerify->messageForReasonZh($reason, $expected, $paid, $rules['maxUnderpayUsdt'], $rules['maxAgeHours']);

            return response()->json([
                'success' => false,
                'deleted' => true,
                'reason' => $reason,
                'message' => $message,
            ], 422);
        }

        $order = $result['order'] ?? null;
        if ($order) {
            $this->telegram->notifyOrderPaid($order);
        }

        return response()->json(['success' => true, 'message' => 'Payment successful!']);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'string']]);
        if ($data['status'] !== 'cancelled') {
            return response()->json(['error' => 'Only cancellation is allowed via this endpoint'], 400);
        }
        $this->orders->cancelByUser($id, $request->user()->id);

        return response()->json(['success' => true]);
    }

    public function tracking(Request $request, int $id): JsonResponse
    {
        $payload = $this->orders->trackingForUser($id, $request->user()->id, $this->sfTracking);
        if ($payload === []) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        return response()->json($payload);
    }
}
