<?php

namespace App\Services\Commerce;

/**
 * 订单履约状态（canonical 值与 DB status 列一致）
 */
enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Delivered = 'delivered';

    /** @var list<string> */
    public const FULFILLED_VALUES = ['paid', 'shipped', 'delivered'];

    public static function normalize(string $status): self
    {
        $status = $status === 'completed' ? 'delivered' : $status;

        return self::from($status);
    }

    public static function tryNormalize(string $status): ?self
    {
        $status = $status === 'completed' ? 'delivered' : $status;

        return self::tryFrom($status);
    }

    /** @return list<string> */
    public static function adminWritableValues(): array
    {
        return array_map(static fn (self $s) => $s->value, self::cases());
    }
}
