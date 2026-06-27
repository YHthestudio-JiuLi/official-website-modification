<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Catalog\ProductCatalogService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(private readonly ProductCatalogService $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $locale = $request->header('Accept-Language', '');
        $translateEn = ! str_starts_with(strtolower($locale), 'zh');
        $limit = $request->integer('limit');
        $limit = $limit > 0 ? min($limit, 100) : null;
        $lang = $translateEn ? 'en' : 'zh';
        $part = 'products:list:'.$lang.':'.($limit ?? 'all');

        $data = PublicApiCache::remember('catalog', $part, fn () => $this->catalog->listProductsForApi($translateEn, null, $limit));

        return response()
            ->json($data)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $locale = $request->header('Accept-Language', '');
        $translateEn = ! str_starts_with(strtolower($locale), 'zh');
        $lang = $translateEn ? 'en' : 'zh';
        $part = 'products:show:'.$id.':'.$lang;

        $product = PublicApiCache::remember('catalog', $part, fn () => $this->catalog->findProductForApi($id, $translateEn));
        if (! $product) {
            return response()->json(['error' => 'Product not found'], 404);
        }

        return response()
            ->json($product)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }
}
