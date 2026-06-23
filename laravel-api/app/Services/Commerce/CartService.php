<?php

namespace App\Services\Commerce;

use App\Models\CartItem;
use Illuminate\Support\Facades\DB;

class CartService
{
    public function getCart(int $userId): array
    {
        return DB::table('cart as c')
            ->join('products as p', 'c.productId', '=', 'p.id')
            ->where('c.userId', $userId)
            ->select([
                'c.id', 'c.userId', 'c.productId', 'c.quantity', 'c.createdAt', 'c.updatedAt',
                'p.name', 'p.description', 'p.image', 'p.price', 'p.priceUsdt',
            ])
            ->orderByDesc('c.updatedAt')
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();
    }

    public function addItem(int $userId, int $productId, int $quantity = 1): void
    {
        $existing = CartItem::query()->where('userId', $userId)->where('productId', $productId)->first();
        if ($existing) {
            $existing->quantity += max(1, $quantity);
            $existing->updatedAt = now();
            $existing->save();

            return;
        }
        CartItem::query()->create([
            'userId' => $userId,
            'productId' => $productId,
            'quantity' => max(1, $quantity),
            'createdAt' => now(),
            'updatedAt' => now(),
        ]);
    }

    public function updateQuantity(int $userId, int $productId, int $quantity): void
    {
        if ($quantity <= 0) {
            $this->removeItem($userId, $productId);

            return;
        }
        CartItem::query()
            ->where('userId', $userId)
            ->where('productId', $productId)
            ->update(['quantity' => $quantity, 'updatedAt' => now()]);
    }

    public function removeItem(int $userId, int $productId): void
    {
        CartItem::query()->where('userId', $userId)->where('productId', $productId)->delete();
    }

    public function clear(int $userId): void
    {
        CartItem::query()->where('userId', $userId)->delete();
    }
}
