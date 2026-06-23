<?php

namespace App\Services\Commerce;

use App\Models\Order;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class OrderNumberGenerator
{
    private const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /** 一级分类码 + 二级分类码 + 6 位随机 = 8 位 */
    public function build(
        ?string $primarySlug,
        ?string $secondarySlug,
        ?string $primaryName = null,
        ?string $secondaryName = null,
    ): string {
        return $this->categoryCode($primarySlug, $primaryName)
            .$this->categoryCode($secondarySlug, $secondaryName)
            .$this->randomSuffix(6);
    }

    public function generateUniqueForProduct(int $productId): string
    {
        $meta = DB::table('products as p')
            ->leftJoin('product_categories as c', 'p.categoryId', '=', 'c.id')
            ->leftJoin('product_categories as sc', 'p.subCategoryId', '=', 'sc.id')
            ->where('p.id', $productId)
            ->select([
                'c.slug as categorySlug',
                'sc.slug as subCategorySlug',
                'c.name as categoryName',
                'sc.name as subCategoryName',
            ])
            ->first();

        $primarySlug = $meta->categorySlug ?? null;
        $secondarySlug = $meta->subCategorySlug ?? null;
        $primaryName = $meta->categoryName ?? null;
        $secondaryName = $meta->subCategoryName ?? null;

        for ($i = 0; $i < 20; $i++) {
            $orderNo = $this->build($primarySlug, $secondarySlug, $primaryName, $secondaryName);
            if (! Order::query()->where('orderNo', $orderNo)->exists()) {
                return $orderNo;
            }
        }

        throw new RuntimeException('Failed to generate unique order number');
    }

    private function categoryCode(?string $slug, ?string $name = null): string
    {
        foreach ([$slug, $name] as $source) {
            if ($source === null || trim($source) === '') {
                continue;
            }
            $length = strlen($source);
            for ($i = 0; $i < $length; $i++) {
                $ch = $source[$i];
                if (ctype_alnum($ch)) {
                    return strtoupper($ch);
                }
            }
        }

        return 'X';
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
