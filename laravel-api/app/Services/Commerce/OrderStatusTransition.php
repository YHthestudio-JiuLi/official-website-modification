<?php

namespace App\Services\Commerce;

use App\Models\Order;
use Illuminate\Validation\ValidationException;

/**
 * 订单状态迁移：唯一写入口，统一时间戳副作用与合法跃迁校验
 */
class OrderStatusTransition
{
    public function nowIso(): string
    {
        return now()->utc()->format('Y-m-d\TH:i:s\Z');
    }

    public function normalize(string $status): OrderStatus
    {
        try {
            return OrderStatus::normalize($status);
        } catch (\ValueError) {
            throw ValidationException::withMessages([
                'status' => ['Invalid order status'],
            ]);
        }
    }

    /** 后台手动改状态 */
    public function applyAdminStatus(Order $order, string $status): void
    {
        $target = $this->normalize($status);
        $current = OrderStatus::tryNormalize((string) $order->status) ?? OrderStatus::Pending;

        if (! $this->canAdminTransition($current, $target)) {
            throw ValidationException::withMessages([
                'status' => ["Cannot transition from {$current->value} to {$target->value}"],
            ]);
        }

        $this->persist($order, $target);
    }

    /** 填写快递单号：已支付订单自动标记已发货 */
    public function applyTrackingNumber(Order $order, ?string $trackingNumber): void
    {
        $value = trim((string) ($trackingNumber ?? ''));
        $patch = ['trackingNumber' => $value !== '' ? $value : null];

        if ($value !== '' && $order->status === OrderStatus::Paid->value) {
            $patch['status'] = OrderStatus::Shipped->value;
            $this->mergeStatusPatch($patch, OrderStatus::Shipped);
        }

        $order->update($patch);
    }

    /** 顺丰轨迹显示签收：仅已发货可推进到已签收 */
    public function applyDeliveredFromRoutes(Order $order, array $routes, SfExpressTrackingService $sf): bool
    {
        if ($order->status !== OrderStatus::Shipped->value) {
            return false;
        }
        if (! $sf->routesIndicateDelivered($routes)) {
            return false;
        }

        $this->persist($order, OrderStatus::Delivered);

        return true;
    }

    public function applyPaid(Order $order, ?string $paidAt = null): void
    {
        $patch = [
            'status' => OrderStatus::Paid->value,
            'paidAt' => $paidAt ?? $this->nowIso(),
        ];
        $order->update($patch);
    }

    private function canAdminTransition(OrderStatus $from, OrderStatus $to): bool
    {
        if ($from === $to) {
            return true;
        }

        $rank = static fn (OrderStatus $s): int => match ($s) {
            OrderStatus::Pending => 0,
            OrderStatus::Paid => 1,
            OrderStatus::Shipped => 2,
            OrderStatus::Delivered => 3,
        };

        return $rank($to) >= $rank($from);
    }

    private function persist(Order $order, OrderStatus $target): void
    {
        $patch = ['status' => $target->value];
        $this->mergeStatusPatch($patch, $target);
        $order->update($patch);
    }

  /**
   * @param  array<string, mixed>  $patch
   */
    private function mergeStatusPatch(array &$patch, OrderStatus $target): void
    {
        $now = $this->nowIso();
        if ($target === OrderStatus::Paid && empty($patch['paidAt'])) {
            $patch['paidAt'] = $now;
        }
        if ($target === OrderStatus::Shipped && empty($patch['shippedAt'])) {
            $patch['shippedAt'] = $now;
        }
        if ($target === OrderStatus::Delivered && empty($patch['completedAt'])) {
            $patch['completedAt'] = $now;
        }
    }
}
