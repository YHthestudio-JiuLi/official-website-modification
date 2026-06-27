<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';

    public $timestamps = false;

    protected $fillable = [
        'orderNo', 'userId', 'username', 'productId', 'productName', 'quantity', 'price', 'totalAmount',
        'status', 'paymentMethod', 'usdtWallet', 'network', 'txHash', 'shippingAddress',
        'trackingNumber', 'createdAt', 'paidAt', 'completedAt', 'configId', 'configName',
    ];

    protected function casts(): array
    {
        return [
            'userId' => 'integer',
            'productId' => 'integer',
            'quantity' => 'integer',
            'price' => 'float',
            'totalAmount' => 'float',
        ];
    }
}
