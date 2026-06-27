<?php

namespace App\Services\Commerce;

use App\Models\Order;
use RuntimeException;

class OrderNumberGenerator
{
    private const PREFIX = 'YH';

    private const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /** 订单号规则：YH + 6 位随机（大小写字母 + 数字） */
    public function build(): string
    {
        return self::PREFIX.$this->randomSuffix(6);
    }

    public function generateUniqueForProduct(int $productId): string
    {
        for ($i = 0; $i < 20; $i++) {
            $orderNo = $this->build();
            if (! Order::query()->where('orderNo', $orderNo)->exists()) {
                return $orderNo;
            }
        }

        throw new RuntimeException('Failed to generate unique order number');
    }

    private function randomSuffix(int $length): string
    {
        $max = strlen(self::CHARSET) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= self::CHARSET[random_int(0, $max)];
        }

        return $out;
    }
}
