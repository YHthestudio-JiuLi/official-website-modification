<?php

namespace App\Services\Commerce;

use App\Models\Order;
use App\Models\User;
use App\Services\Agent\AgentDataScope;
use App\Services\Catalog\ProductCatalogService;
use App\Services\Catalog\ProductNormalizer;
use App\Services\Catalog\ProductTranslator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderService
{
    public function __construct(
        private readonly ProductCatalogService $catalog,
        private readonly ProductTranslator $translator,
        private readonly ProductNormalizer $productNormalizer,
        private readonly AgentDataScope $agentScope,
        private readonly UsdtTxVerificationService $txVerify,
        private readonly PaymentSettingsService $paymentSettings,
        private readonly OrderNumberGenerator $orderNumbers,
        private readonly OrderStatusTransition $statusTransitions,
        private readonly OrderFulfillmentService $fulfillment,
    ) {}

    public function listForUser(int $userId): array
    {
        return Order::query()
            ->where('userId', $userId)
            ->orderByDesc('createdAt')
            ->get()
            ->map(fn ($o) => $this->enrichNetwork($o->toArray()))
            ->all();
    }

    public function findForUser(int $orderId, int $userId): ?array
    {
        $order = Order::query()->where('id', $orderId)->where('userId', $userId)->first();
        if (! $order) {
            return null;
        }

        return $this->enrichNetwork($this->detailRow($orderId));
    }

    /**
     * @return array<string, mixed>
     */
    public function previewCheckout(array $data): array
    {
        $checkout = $this->resolveCheckoutData($data);

        return [
            'id' => null,
            'orderNo' => null,
            'status' => OrderStatus::Pending->value,
            'productId' => $checkout['productId'],
            'productName' => $checkout['productName'],
            'quantity' => $checkout['quantity'],
            'price' => $checkout['price'],
            'totalAmount' => $checkout['totalAmount'],
            'paymentMethod' => 'USDT',
            'usdtWallet' => $checkout['walletAddress'],
            'network' => $checkout['network'],
            'configId' => $checkout['configId'],
            'configName' => $checkout['configName'],
            'shippingAddress' => '',
            'txHash' => '',
        ];
    }

    /**
     * @return array{orderId:int, order:array}
     */
    public function createPaidForUser(int $userId, string $username, array $data): array
    {
        $shippingAddress = trim((string) ($data['shippingAddress'] ?? ''));
        $txHash = trim((string) ($data['txHash'] ?? ''));
        if ($shippingAddress === '') {
            throw ValidationException::withMessages(['shippingAddress' => ['Shipping address required']]);
        }
        if ($txHash === '') {
            throw ValidationException::withMessages(['txHash' => ['Transaction hash required']]);
        }
        $this->assertTxHashUnused($txHash);

        $checkout = $this->resolveCheckoutData($data);
        $verification = $this->verifyUsdtPayment(
            $checkout['network'],
            $txHash,
            $checkout['totalAmount'],
            $checkout['walletAddress']
        );
        if (! $verification['valid']) {
            throw ValidationException::withMessages([
                'txHash' => [
                    $this->txVerifyFailureMessage(
                        $verification,
                        $checkout['totalAmount'],
                        $verification['rules']
                    ),
                ],
            ]);
        }

        $orderNo = $this->orderNumbers->generateUniqueForProduct($checkout['productId']);
        $now = $this->statusTransitions->nowIso();
        $order = Order::query()->create([
            'orderNo' => $orderNo,
            'userId' => $userId,
            'username' => $username,
            'productId' => $checkout['productId'],
            'productName' => $checkout['productName'],
            'quantity' => $checkout['quantity'],
            'price' => $checkout['price'],
            'totalAmount' => $checkout['totalAmount'],
            'status' => OrderStatus::Paid->value,
            'paymentMethod' => 'USDT',
            'usdtWallet' => $checkout['walletAddress'],
            'network' => $checkout['network'],
            'shippingAddress' => $shippingAddress,
            'txHash' => $txHash,
            'createdAt' => $now,
            'paidAt' => $now,
            'configId' => $checkout['configId'],
            'configName' => $checkout['configName'],
        ]);

        $orderId = (int) $order->id;
        $orderPayload = $this->findByIdEnriched($orderId) ?? $this->enrichNetwork($order->toArray());
        $verifyRules = $verification['rules'];
        if ($verifyRules['maxUnderpayUsdt'] <= 0 && $verifyRules['maxAgeHours'] <= 0) {
            $orderPayload['txVerifyDisabled'] = true;
        }

        return [
            'orderId' => $orderId,
            'order' => $orderPayload,
        ];
    }

    /**
     * @return array{deleted: bool, reason?: string, paid_amount?: float|null, order?: array|null}
     */
    public function confirmPayment(int $orderId, int $userId, array $data): array
    {
        $order = Order::query()->where('id', $orderId)->where('userId', $userId)->first();
        if (! $order) {
            throw ValidationException::withMessages(['order' => ['Order not found']]);
        }
        if ($order->status !== OrderStatus::Pending->value) {
            throw ValidationException::withMessages(['order' => ['Order is already confirmed or not payable']]);
        }
        $address = trim((string) ($data['shippingAddress'] ?? ''));
        $txHash = trim((string) ($data['txHash'] ?? ''));
        if ($address === '') {
            throw ValidationException::withMessages(['shippingAddress' => ['Shipping address required']]);
        }
        if ($txHash === '') {
            throw ValidationException::withMessages(['txHash' => ['Transaction hash required']]);
        }
        $paymentSettings = $this->paymentSettings->get();
        $verification = $this->verifyUsdtPayment(
            (string) ($order->network ?? 'TRC20'),
            $txHash,
            (float) $order->totalAmount,
            (string) ($paymentSettings['wallet_address'] ?? '')
        );
        $verifyRules = $verification['rules'];

        if (! $verification['valid']) {
            if ($verification['delete_order']) {
                $expectedAmount = (float) $order->totalAmount;
                DB::transaction(function () use ($orderId, $userId): void {
                    $lockedOrder = Order::query()
                        ->where('id', $orderId)
                        ->where('userId', $userId)
                        ->lockForUpdate()
                        ->first();
                    if (! $lockedOrder) {
                        throw ValidationException::withMessages(['order' => ['Order not found']]);
                    }
                    if ($lockedOrder->status !== OrderStatus::Pending->value) {
                        throw ValidationException::withMessages(['order' => ['Order is already confirmed or not payable']]);
                    }
                    $lockedOrder->delete();
                });

                return [
                    'deleted' => true,
                    'reason' => $verification['reason'],
                    'paid_amount' => $verification['paid_amount'],
                    'expected_amount' => $expectedAmount,
                ];
            }

            throw ValidationException::withMessages([
                'txHash' => [
                    $this->txVerifyFailureMessage(
                        $verification,
                        (float) $order->totalAmount,
                        $verifyRules
                    ),
                ],
            ]);
        }

        DB::transaction(function () use ($orderId, $userId, $address, $txHash): void {
            $lockedOrder = Order::query()
                ->where('id', $orderId)
                ->where('userId', $userId)
                ->lockForUpdate()
                ->first();
            if (! $lockedOrder) {
                throw ValidationException::withMessages(['order' => ['Order not found']]);
            }
            if ($lockedOrder->status !== OrderStatus::Pending->value) {
                throw ValidationException::withMessages(['order' => ['Order is already confirmed or not payable']]);
            }

            $this->assertTxHashUnused($txHash, $orderId);
            $lockedOrder->update([
                'shippingAddress' => $address,
                'txHash' => $txHash,
            ]);
            $this->statusTransitions->applyPaid($lockedOrder);
        });

        $orderPayload = $this->findByIdEnriched($orderId);
        if ($orderPayload === null) {
            $fresh = Order::query()->find($orderId);
            $orderPayload = $fresh ? $this->enrichNetwork($fresh->toArray()) : null;
        }
        if ($orderPayload !== null
            && $verifyRules['maxUnderpayUsdt'] <= 0
            && $verifyRules['maxAgeHours'] <= 0) {
            $orderPayload['txVerifyDisabled'] = true;
        }

        return [
            'deleted' => false,
            'order' => $orderPayload,
        ];
    }

    public function findByIdEnriched(int $orderId): ?array
    {
        $row = $this->detailRow($orderId);
        if ($row === []) {
            return null;
        }

        return $this->enrichNetwork($row);
    }

    public function adminList(?string $status = null, ?User $actor = null): array
    {
        $q = Order::query()->orderByDesc('createdAt');
        if ($status) {
            $q->where('status', $status === 'completed' ? OrderStatus::Delivered->value : $status);
        }
        if ($actor && $this->agentScope->isScopedAgent($actor)) {
            $this->agentScope->scopeOrderQuery($q, $actor);
        }

        return $q->get()->map(fn ($o) => $o->toArray())->all();
    }

    public function adminUpdateStatus(int $orderId, string $status, ?User $actor = null): void
    {
        $order = Order::query()->findOrFail($orderId);
        $this->fulfillment->assertAgentCanAccessOrder($actor, $orderId);
        $this->statusTransitions->applyAdminStatus($order, $status);
    }

    public function adminDelete(int $orderId, ?User $actor = null): void
    {
        $this->fulfillment->assertAgentCanAccessOrder($actor, $orderId);
        Order::query()->where('id', $orderId)->delete();
    }

    public function adminUpdateTracking(int $orderId, ?string $trackingNumber, ?User $actor = null): array
    {
        return $this->fulfillment->adminUpdateTracking($orderId, $trackingNumber, $actor);
    }

    /**
     * 物流查询（只读）+ 显式签收同步（仅 shipped → delivered）
     *
     * @return array<string, mixed>
     */
    public function trackingForUser(int $orderId, int $userId): array
    {
        $order = Order::query()->where('id', $orderId)->where('userId', $userId)->first();
        if (! $order) {
            return [];
        }

        $snapshot = $this->fulfillment->queryTracking($order);

        if (
            ($snapshot['deliveryDetected'] ?? false)
            && $order->status === OrderStatus::Shipped->value
        ) {
            $this->fulfillment->syncDeliveredFromRoutes($order, $snapshot['routes'] ?? []);
            $order->refresh();
        }

        unset($snapshot['deliveryDetected']);

        return array_merge($snapshot, [
            'orderStatus' => OrderStatus::normalize((string) $order->status)->value,
        ]);
    }

    private function detailRow(int $orderId): array
    {
        $row = DB::table('orders as o')
            ->leftJoin('products as p', 'o.productId', '=', 'p.id')
            ->leftJoin('product_categories as c', 'p.categoryId', '=', 'c.id')
            ->leftJoin('product_categories as sc', 'p.subCategoryId', '=', 'sc.id')
            ->where('o.id', $orderId)
            ->select(['o.*', 'c.name as categoryName', 'sc.name as subCategoryName'])
            ->first();

        return $row ? (array) $row : [];
    }

    private function enrichNetwork(array $order): array
    {
        if (empty($order['network'])) {
            $settings = $this->paymentSettings();
            $order['network'] = $settings['network'] ?? 'TRC20';
        }

        return $order;
    }

    private function paymentSettings(): array
    {
        return $this->paymentSettings->getPublic();
    }

    private function assertTxHashUnused(string $txHash, ?int $ignoreOrderId = null): void
    {
        $q = Order::query()->where('txHash', $txHash);
        if ($ignoreOrderId !== null) {
            $q->where('id', '!=', $ignoreOrderId);
        }
        if ($q->exists()) {
            throw ValidationException::withMessages([
                'txHash' => ['该交易哈希已被使用，请勿重复提交'],
            ]);
        }
    }

    /**
     * @return array{
     *   productId:int,
     *   quantity:int,
     *   price:float,
     *   totalAmount:float,
     *   productName:string,
     *   walletAddress:string,
     *   network:string,
     *   configId:?string,
     *   configName:?string
     * }
     */
    private function resolveCheckoutData(array $data): array
    {
        $productId = (int) ($data['productId'] ?? 0);
        $product = $this->catalog->findProductForApi($productId, false);
        if (! $product) {
            throw ValidationException::withMessages(['productId' => ['Product not found']]);
        }

        $qty = max(1, (int) ($data['quantity'] ?? 1));
        try {
            $checkoutConfig = $this->productNormalizer->resolveCheckoutConfig(
                $product,
                isset($data['configId']) ? (string) $data['configId'] : null
            );
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['configId' => [$e->getMessage()]]);
        }

        $translated = $this->translator->translateProduct($product, true);
        $productName = (string) ($translated['name'] ?? $product['name'] ?? '');
        if (! empty($checkoutConfig['configName'])) {
            $productName .= ' - '.$checkoutConfig['configName'];
        }
        $settings = $this->paymentSettings();
        $price = (float) $checkoutConfig['price'];

        return [
            'productId' => $productId,
            'quantity' => $qty,
            'price' => $price,
            'totalAmount' => $price * $qty,
            'productName' => $productName,
            'walletAddress' => (string) ($settings['wallet_address'] ?? ''),
            'network' => (string) ($settings['network'] ?? 'TRC20'),
            'configId' => $checkoutConfig['configId'],
            'configName' => $checkoutConfig['configName'],
        ];
    }

    /**
     * @return array{valid: bool, reason: string, paid_amount: ?float, delete_order: bool, rules: array{maxUnderpayUsdt: float, maxAgeHours: int}}
     */
    private function verifyUsdtPayment(
        string $network,
        string $txHash,
        float $expectedAmount,
        string $walletAddress
    ): array {
        $rules = $this->paymentSettings->txVerifyRules();
        $result = $this->txVerify->verify(
            $network,
            $txHash,
            $expectedAmount,
            $rules['maxUnderpayUsdt'],
            $rules['maxAgeHours'],
            $walletAddress
        );

        return array_merge($result, ['rules' => $rules]);
    }

    private function txVerifyFailureMessage(array $verification, float $expectedAmount, array $rules): string
    {
        return $this->txVerify->messageForReasonZh(
            $verification['reason'],
            $expectedAmount,
            $verification['paid_amount'],
            $rules['maxUnderpayUsdt'],
            $rules['maxAgeHours']
        );
    }
}
