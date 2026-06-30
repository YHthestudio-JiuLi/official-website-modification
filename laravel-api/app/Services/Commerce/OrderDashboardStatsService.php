<?php

namespace App\Services\Commerce;

use App\Models\ForumPost;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Agent\AgentDataScope;

/** 仪表盘订单统计（与 OrderService 解耦） */
class OrderDashboardStatsService
{
    public function __construct(private readonly AgentDataScope $agentScope) {}

    /**
     * @return array<string, mixed>
     */
    public function stats(?User $actor = null): array
    {
        $fulfilled = OrderStatus::FULFILLED_VALUES;
        $fulfilledList = "'".implode("','", $fulfilled)."'";

        $isAgent = $actor && $this->agentScope->isScopedAgent($actor);

        if ($isAgent) {
            $orderBase = Order::query();
            $this->agentScope->scopeOrderQuery($orderBase, $actor);
            $totalOrders = (clone $orderBase)->count();
            $pendingOrders = (clone $orderBase)->where('status', OrderStatus::Pending->value)->count();
            $totalRevenue = (float) (clone $orderBase)->whereIn('status', $fulfilled)->sum('totalAmount');
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
            ->selectRaw("SUM(CASE WHEN status IN ({$fulfilledList}) THEN totalAmount ELSE 0 END) as total_revenue")
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
}
