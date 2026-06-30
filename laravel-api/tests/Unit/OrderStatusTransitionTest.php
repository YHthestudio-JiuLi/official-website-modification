<?php

namespace Tests\Unit;

use App\Services\Commerce\OrderStatus;
use App\Services\Commerce\OrderStatusTransition;
use App\Services\Commerce\SfExpressTrackingService;
use PHPUnit\Framework\TestCase;

class OrderStatusTransitionTest extends TestCase
{
    public function test_normalize_maps_completed_to_delivered(): void
    {
        $transition = new OrderStatusTransition();

        $this->assertSame(
            OrderStatus::Delivered,
            $transition->normalize('completed')
        );
    }

    public function test_routes_indicate_delivered_skips_pending_sign_keywords(): void
    {
        $sf = new SfExpressTrackingService();

        $this->assertFalse($sf->routesIndicateDelivered([
            ['time' => '2026-01-01', 'location' => 'SZ', 'remark' => '派送中'],
        ]));
        $this->assertTrue($sf->routesIndicateDelivered([
            ['time' => '2026-01-02', 'location' => 'SZ', 'remark' => '已签收'],
        ]));
    }
}
