<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Catalog\ProductCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(private readonly ProductCatalogService $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $locale = $request->header('Accept-Language', '');
        $translateEn = ! str_starts_with(strtolower($locale), 'zh');

        return response()->json($this->catalog->listProductsForApi($translateEn));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $locale = $request->header('Accept-Language', '');
        $translateEn = ! str_starts_with(strtolower($locale), 'zh');

        $product = $this->catalog->findProductForApi($id, $translateEn);
        if (! $product) {
            return response()->json(['error' => 'Product not found'], 404);
        }

        return response()->json($product);
    }
}
