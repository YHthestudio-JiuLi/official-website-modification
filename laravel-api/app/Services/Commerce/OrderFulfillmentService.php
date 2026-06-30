<?php

namespace App\Services\Commerce;

use App\Models\Order;
use App\Models\User;
use App\Services\Agent\AgentDataScope;

/**
 * 物流查询与签收同步（读轨迹 + 显式签收命令分离）
 */
class OrderFulfillmentService
{
    public function __construct(
        private readonly SfExpressTrackingService $sf,
        private readonly OrderStatusTransition $transitions,
        private readonly AgentDataScope $agentScope,
    ) {}

    public function assertAgentCanAccessOrder(?User $actor, int $orderId): void
    {
        if (! $actor || ! $this->agentScope->isScopedAgent($actor)) {
            return;
        }
        $scoped = Order::query()->where('id', $orderId);
        $this->agentScope->scopeOrderQuery($scoped, $actor);
        if (! $scoped->exists()) {
            abort(403, 'Order out of scope');
        }
    }

    /**
     * 查询物流轨迹（只读）
     *
     * @return array<string, mixed>
     */
    public function queryTracking(Order $order): array
    {
        $trackingNumber = trim((string) ($order->trackingNumber ?? ''));
        if ($trackingNumber === '') {
            return [
                'trackingNumber' => null,
                'carrier' => 'SF',
                'routes' => [],
                'source' => 'none',
                'externalUrl' => null,
                'apiEnabled' => $this->sf->isConfigured(),
                'deliveryDetected' => false,
            ];
        }

        $phoneLast4 = SfExpressTrackingService::phoneLast4FromAddress($order->shippingAddress);
        $result = $this->sf->queryRoutes($trackingNumber, $phoneLast4);

        return [
            'trackingNumber' => $trackingNumber,
            'carrier' => 'SF',
            'routes' => $result['routes'],
            'source' => $result['source'],
            'externalUrl' => $this->sf->externalTrackUrl($trackingNumber),
            'apiEnabled' => $this->sf->isConfigured(),
            'message' => $result['message'] ?? null,
            'deliveryDetected' => $this->sf->routesIndicateDelivered($result['routes']),
        ];
    }

    /**
     * 根据轨迹尝试推进为已签收（仅 shipped → delivered）
     */
    public function syncDeliveredFromRoutes(Order $order, array $routes): bool
    {
        return $this->transitions->applyDeliveredFromRoutes($order, $routes, $this->sf);
    }

    public function adminUpdateTracking(int $orderId, ?string $trackingNumber, ?User $actor = null): array
    {
        $order = Order::query()->findOrFail($orderId);
        $this->assertAgentCanAccessOrder($actor, $orderId);
        $this->transitions->applyTrackingNumber($order, $trackingNumber);

        return $order->fresh()->toArray();
    }
}
