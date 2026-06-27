<?php

namespace App\Console\Commands;

use App\Models\StoredImage;
use App\Services\Catalog\ProductCatalogService;
use App\Support\ProductImageDiskCache;
use App\Support\PublicApiCache;
use Illuminate\Console\Command;

/** 部署后预热 Redis 与商品图磁盘缓存 */
class WarmCatalogCache extends Command
{
    protected $signature = 'catalog:warm {--images : 同步 MySQL BLOB 到磁盘缓存}';

    protected $description = '预热公开商品/分类 API 缓存，可选导出商品图到磁盘';

    public function handle(ProductCatalogService $catalog): int
    {
        $this->info('预热 catalog Redis 缓存…');

        foreach ([false, true] as $translateEn) {
            $lang = $translateEn ? 'en' : 'zh';
            PublicApiCache::remember(
                'catalog',
                'products:list:'.$lang.':all',
                fn () => $catalog->listProductsForApiLite($translateEn, null, null),
                PublicApiCache::TTL_CATALOG_SECONDS
            );
            PublicApiCache::remember(
                'catalog',
                'products:list:'.$lang.':3',
                fn () => $catalog->listProductsForApiLite($translateEn, null, 3),
                PublicApiCache::TTL_CATALOG_SECONDS
            );
        }
        PublicApiCache::remember(
            'catalog',
            'categories',
            fn () => $catalog->listCategories(),
            PublicApiCache::TTL_CATALOG_SECONDS
        );
        PublicApiCache::remember(
            'catalog',
            'storefront:zh:all:1',
            fn () => [
                'products' => $catalog->listProductsForApiLite(false, null, null),
                'categories' => $catalog->listCategories(),
            ],
            PublicApiCache::TTL_CATALOG_SECONDS
        );
        PublicApiCache::remember(
            'catalog',
            'storefront:zh:3:0',
            fn () => ['products' => $catalog->listProductsForApiLite(false, null, 3)],
            PublicApiCache::TTL_CATALOG_SECONDS
        );

        $this->info('Redis 预热完成');

        if ($this->option('images')) {
            $this->warmImages();
        }

        return self::SUCCESS;
    }

    private function warmImages(): void
    {
        $this->info('导出商品图到磁盘…');
        $count = 0;
        StoredImage::query()
            ->select(['id', 'mime', 'data'])
            ->orderBy('id')
            ->chunk(50, function ($rows) use (&$count) {
                foreach ($rows as $row) {
                    if (empty($row->data)) {
                        continue;
                    }
                    ProductImageDiskCache::write((int) $row->id, $row->data, $row->mime ?: 'image/jpeg');
                    $count++;
                }
            });
        $this->info("磁盘缓存 {$count} 张图片");
    }
}
