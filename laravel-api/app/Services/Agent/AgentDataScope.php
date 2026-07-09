<?php

namespace App\Services\Agent;

use App\Models\User;
use App\Services\Database\PyDbClient;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use RuntimeException;

/**
 * 代理数据范围：仅自己的商品、相关订单与仪表盘统计
 * isScopedAgent 以 Python RPC users.isScopedAgent 为唯一权威实现
 */
class AgentDataScope
{
    public function __construct(
        private readonly PyDbClient $db,
    ) {}

    /** 是否为受数据范围限制的代理（非超管） */
    public function isScopedAgent(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        try {
            return (bool) $this->db->call('users.isScopedAgent', ['id' => $user->id]);
        } catch (RuntimeException) {
            // Python 不可用时回退本地角色判断（与 py_backend users.is_scoped_agent 语义对齐）
            return $this->isScopedAgentFromLocalRoles($user);
        }
    }

    /** RPC 不可用时的本地回退（勿在其他处重复实现） */
    private function isScopedAgentFromLocalRoles(User $user): bool
    {
        return $user->hasRole('agent') && ! $user->isSuperAdmin();
    }

    public function agentRecord(User $user): ?\App\Models\Agent
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
        return \App\Models\Product::query()
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

    public function canManageProduct(User $user, \App\Models\Product $product): bool
    {
        if (! $this->isScopedAgent($user)) {
            return true;
        }

        return (int) $product->createdByUserId === (int) $user->id;
    }

    public function assertCanManageProduct(User $user, \App\Models\Product $product): void
    {
        if (! $this->canManageProduct($user, $product)) {
            abort(404, 'Product not found');
        }
    }

    /**
     * 代理仅能管理自己创建的资源；非代理无限制。无权限时返回 404。
     *
     * @param  array<string, mixed>|null  $row
     */
    public function assertCreatedBy(User $user, ?array $row, string $notFoundMessage): void
    {
        if (! $this->isScopedAgent($user)) {
            return;
        }
        if (! $row || (int) ($row['created_by_user_id'] ?? 0) !== (int) $user->id) {
            abort(404, $notFoundMessage);
        }
    }

    /** @param  array<string, mixed>|null  $device */
    public function assertCanManageDevice(User $user, ?array $device): void
    {
        $this->assertCreatedBy($user, $device, 'Device not found');
    }

    /** @param  array<string, mixed>|null  $question */
    public function assertCanManageQuestion(User $user, ?array $question): void
    {
        $this->assertCreatedBy($user, $question, 'Question not found');
    }

    /** @param  array<string, mixed>|null  $firmware */
    public function assertCanManageFirmware(User $user, ?array $firmware): void
    {
        $this->assertCreatedBy($user, $firmware, 'Firmware not found');
    }

    /** 代理范围内已支付/已完成订单销售总额 */
    public function sumPaidRevenue(User $user): float
    {
        $query = \App\Models\Order::query()->whereIn('status', \App\Services\Commerce\OrderStatus::FULFILLED_VALUES);
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
