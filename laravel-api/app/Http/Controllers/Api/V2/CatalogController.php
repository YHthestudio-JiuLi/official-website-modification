<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Catalog\ProductCatalogService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 前台商城聚合读接口：减少 PHP-FPM 并发占用 */
class CatalogController extends Controller
{
    public function __construct(private readonly ProductCatalogService $catalog) {}

    public function storefront(Request $request): JsonResponse
    {
        $locale = $request->header('Accept-Language', '');
        $translateEn = ! str_starts_with(strtolower($locale), 'zh');
        $limit = $request->integer('limit');
        $limit = $limit > 0 ? min($limit, 100) : null;
        $lang = $translateEn ? 'en' : 'zh';
        $withCategories = $request->boolean('categories', true);
        $part = 'storefront:'.$lang.':'.($limit ?? 'all').':'.($withCategories ? '1' : '0');

        $payload = PublicApiCache::remember(
            'catalog',
            $part,
            function () use ($translateEn, $limit, $withCategories) {
                $data = [
                    'products' => $this->catalog->listProductsForApiLite($translateEn, null, $limit),
                ];
                if ($withCategories) {
                    $data['categories'] = $this->catalog->listCategories();
                }

                return $data;
            },
            PublicApiCache::TTL_CATALOG_SECONDS
        );

        return response()
            ->json($payload)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_CATALOG_SECONDS);
    }
}
