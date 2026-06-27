<?php

namespace App\Services\Commerce;

use App\Models\ForumPost;
use App\Models\Order;
use App\Models\PaymentSetting;
use App\Models\Product;
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

    public function createForUser(int $userId, string $username, array $data): int
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
        $price = $checkoutConfig['price'];
        $settings = $this->paymentSettings();
        $translated = $this->translator->translateProduct($product, true);
        $orderNo = $this->orderNumbers->generateUniqueForProduct($productId);
        $productName = $translated['name'] ?? $product['name'];
        if (! empty($checkoutConfig['configName'])) {
            $productName .= ' - '.$checkoutConfig['configName'];
        }

        $order = Order::query()->create([
            'orderNo' => $orderNo,
            'userId' => $userId,
            'username' => $username,
            'productId' => $productId,
            'productName' => $productName,
            'quantity' => $qty,
            'price' => $price,
            'totalAmount' => $price * $qty,
            'status' => 'pending',
            'paymentMethod' => 'USDT',
            'usdtWallet' => $settings['wallet_address'] ?? '',
            'network' => $settings['network'] ?? 'TRC20',
            'shippingAddress' => $data['shippingAddress'] ?? null,
            'createdAt' => now()->utc()->format('Y-m-d\TH:i:s\Z'),
            'configId' => $checkoutConfig['configId'],
            'configName' => $checkoutConfig['configName'],
        ]);

        return (int) $order->id;
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
        if ($order->status !== 'pending') {
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

        $verifyRules = $this->paymentSettings->txVerifyRules();
        $paymentSettings = $this->paymentSettings->get();
        $verification = $this->txVerify->verify(
            (string) ($order->network ?? 'TRC20'),
            $txHash,
            (float) $order->totalAmount,
            $verifyRules['maxUnderpayUsdt'],
            $verifyRules['maxAgeHours'],
            (string) ($paymentSettings['wallet_address'] ?? '')
        );

        if (! $verification['valid']) {
            if ($verification['delete_order']) {
                $expectedAmount = (float) $order->totalAmount;
                $order->delete();

                return [
                    'deleted' => true,
                    'reason' => $verification['reason'],
                    'paid_amount' => $verification['paid_amount'],
                    'expected_amount' => $expectedAmount,
                ];
            }

            throw ValidationException::withMessages([
                'txHash' => [
                    $this->txVerify->messageForReasonZh(
                        $verification['reason'],
                        (float) $order->totalAmount,
                        $verification['paid_amount'],
                        $verifyRules['maxUnderpayUsdt'],
                        $verifyRules['maxAgeHours']
                    ),
                ],
            ]);
        }

        $now = now()->utc()->format('Y-m-d\TH:i:s\Z');
        $order->update([
            'shippingAddress' => $address,
            'txHash' => $txHash,
            'status' => 'paid',
            'paidAt' => $now,
        ]);

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

    /** 支付通知用：含商品分类等关联字段 */
    public function findByIdEnriched(int $orderId): ?array
    {
        $row = $this->detailRow($orderId);
        if ($row === []) {
            return null;
        }

        return $this->enrichNetwork($row);
    }

    public function cancelByUser(int $orderId, int $userId): void
    {
        $order = Order::query()->where('id', $orderId)->where('userId', $userId)->first();
        if (! $order) {
            throw ValidationException::withMessages(['order' => ['Order not found']]);
        }
        if ($order->status !== 'pending') {
            throw ValidationException::withMessages(['order' => ['Only pending orders can be cancelled']]);
        }
        $order->update(['status' => 'cancelled']);
    }

    public function adminList(?string $status = null, ?User $actor = null): array
    {
        $q = Order::query()->orderByDesc('createdAt');
        if ($status) {
            $q->where('status', $status);
        }
        if ($actor && $this->agentScope->isScopedAgent($actor)) {
            $this->agentScope->scopeOrderQuery($q, $actor);
        }

        return $q->get()->map(fn ($o) => $o->toArray())->all();
    }

    public function adminUpdateStatus(int $orderId, string $status, ?User $actor = null): void
    {
        $order = Order::query()->findOrFail($orderId);
        if ($actor && $this->agentScope->isScopedAgent($actor)) {
            $scoped = Order::query()->where('id', $orderId);
            $this->agentScope->scopeOrderQuery($scoped, $actor);
            if (! $scoped->exists()) {
                abort(403, 'Order out of scope');
            }
        }
        $now = now()->utc()->format('Y-m-d\TH:i:s\Z');
        $patch = ['status' => $status];
        if ($status === 'paid') {
            $patch['paidAt'] = $now;
        }
        if ($status === 'completed') {
            $patch['completedAt'] = $now;
        }
        $order->update($patch);
    }

    public function adminDelete(int $orderId, ?User $actor = null): void
    {
        if ($actor && $this->agentScope->isScopedAgent($actor)) {
            $scoped = Order::query()->where('id', $orderId);
            $this->agentScope->scopeOrderQuery($scoped, $actor);
            if (! $scoped->exists()) {
                abort(403, 'Order out of scope');
            }
        }
        Order::query()->where('id', $orderId)->delete();
    }

    public function adminUpdateTracking(int $orderId, ?string $trackingNumber, ?User $actor = null): array
    {
        $order = Order::query()->findOrFail($orderId);
        if ($actor && $this->agentScope->isScopedAgent($actor)) {
            $scoped = Order::query()->where('id', $orderId);
            $this->agentScope->scopeOrderQuery($scoped, $actor);
            if (! $scoped->exists()) {
                abort(403, 'Order out of scope');
            }
        }

        $value = trim((string) ($trackingNumber ?? ''));
        $order->update(['trackingNumber' => $value !== '' ? $value : null]);

        return $order->fresh()->toArray();
    }

    public function trackingForUser(int $orderId, int $userId, SfExpressTrackingService $sf): array
    {
        $order = Order::query()->where('id', $orderId)->where('userId', $userId)->first();
        if (! $order) {
            return [];
        }

        $trackingNumber = trim((string) ($order->trackingNumber ?? ''));
        if ($trackingNumber === '') {
            return [
                'trackingNumber' => null,
                'carrier' => 'SF',
                'routes' => [],
                'source' => 'none',
                'externalUrl' => null,
                'apiEnabled' => $sf->isConfigured(),
            ];
        }

        $phoneLast4 = SfExpressTrackingService::phoneLast4FromAddress($order->shippingAddress);
        $result = $sf->queryRoutes($trackingNumber, $phoneLast4);

        return [
            'trackingNumber' => $trackingNumber,
            'carrier' => 'SF',
            'routes' => $result['routes'],
            'source' => $result['source'],
            'externalUrl' => $sf->externalTrackUrl($trackingNumber),
            'apiEnabled' => $sf->isConfigured(),
            'message' => $result['message'] ?? null,
        ];
    }

    public function stats(?User $actor = null): array
    {
        $isAgent = $actor && $this->agentScope->isScopedAgent($actor);

        if ($isAgent) {
            $orderBase = Order::query();
            $this->agentScope->scopeOrderQuery($orderBase, $actor);
            $totalOrders = (clone $orderBase)->count();
            $pendingOrders = (clone $orderBase)->where('status', 'pending')->count();
            $totalRevenue = (float) (clone $orderBase)->whereIn('status', ['paid', 'completed'])->sum('totalAmount');
            $downlineUsers = count($this->agentScope->descendantUserIds($actor));
            $myProducts = Product::query()->where('createdByUserId', $actor->id)->count();

            return [
                'scope' => 'agent',
                'downlineUsers' => max(0, $downlineUsers - 1),
                'totalUsers' => max(0, $downlineUsers - 1),
                'totalProducts' => $myProducts,
                'totalPosts' => 0,
                'totalOrders' => $totalOrders,
                'pendingOrders' => $pendingOrders,
                'totalRevenue' => $totalRevenue,
            ];
        }

        $orderAgg = Order::query()
            ->selectRaw('COUNT(*) as total_orders')
            ->selectRaw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders")
            ->selectRaw("SUM(CASE WHEN status IN ('paid', 'completed') THEN totalAmount ELSE 0 END) as total_revenue")
            ->first();

        return [
            'scope' => 'admin',
            'totalUsers' => User::query()->count(),
            'totalProducts' => Product::query()->count(),
            'totalPosts' => ForumPost::query()->count(),
            'totalOrders' => (int) ($orderAgg->total_orders ?? 0),
            'pendingOrders' => (int) ($orderAgg->pending_orders ?? 0),
            'totalRevenue' => (float) ($orderAgg->total_revenue ?? 0),
        ];
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
        $row = PaymentSetting::query()->orderByDesc('id')->first();

        return $row ? $row->toArray() : ['wallet_address' => '', 'network' => 'TRC20'];
    }
}
