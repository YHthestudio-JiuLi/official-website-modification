<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Catalog\ProductCatalogService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;

class ProductCategoryController extends Controller
{
    public function __construct(private readonly ProductCatalogService $catalog) {}

    public function index(): JsonResponse
    {
        $data = PublicApiCache::remember('catalog', 'categories', fn () => $this->catalog->listCategories());

        return response()
            ->json($data)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }
}
