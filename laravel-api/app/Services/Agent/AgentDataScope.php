<?php

namespace App\Services\Agent;

use App\Models\Agent;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * 代理数据范围：仅自己的商品、相关订单与仪表盘统计
 */
class AgentDataScope
{
    /** 是否为受数据范围限制的代理（非超管） */
    public function isScopedAgent(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return $user->hasRole('agent') && ! $user->isSuperAdmin();
    }

    public function agentRecord(User $user): ?Agent
    {
        return $user->agent;
    }

    /** 自己及下级代理关联的用户 ID */
    public function descendantUserIds(User $user): array
    {
        $agent = $this->agentRecord($user);
        if (! $agent) {
            return [$user->id];
        }

        return $agent->descendantUserIds();
    }

    /** 当前代理创建的商品 ID */
    public function ownedProductIds(User $user): array
    {
        return Product::query()
            ->where('createdByUserId', $user->id)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function scopeProductQuery(Builder|QueryBuilder $query, User $user, string $column = 'createdByUserId'): Builder|QueryBuilder
    {
        return $query->where($column, $user->id);
    }

    /** 订单：自己商品产生的销售，或下级用户下的单 */
    public function scopeOrderQuery(Builder|QueryBuilder $query, User $user): Builder|QueryBuilder
    {
        $productIds = $this->ownedProductIds($user);
        $buyerIds = $this->descendantUserIds($user);

        return $query->where(function ($q) use ($productIds, $buyerIds) {
            if (! empty($productIds)) {
                $q->whereIn('productId', $productIds);
            }
            $q->orWhereIn('userId', $buyerIds);
        });
    }

    public function canManageProduct(User $user, Product $product): bool
    {
        if (! $this->isScopedAgent($user)) {
            return true;
        }

        return (int) $product->createdByUserId === (int) $user->id;
    }

    public function assertCanManageProduct(User $user, Product $product): void
    {
        if (! $this->canManageProduct($user, $product)) {
            abort(403, 'You can only manage products you created');
        }
    }

    /** 代理范围内已支付/已完成订单销售总额 */
    public function sumPaidRevenue(User $user): float
    {
        $query = Order::query()->whereIn('status', ['paid', 'completed']);
        $this->scopeOrderQuery($query, $user);

        return (float) $query->sum('totalAmount');
    }

    /** 按佣金比例计算抽用后的营收 */
    public function netRevenueAfterCommission(float $gross, float $commissionRate): float
    {
        $rate = max(0, min(100, $commissionRate));

        return round($gross * (1 - $rate / 100), 2);
    }
}
