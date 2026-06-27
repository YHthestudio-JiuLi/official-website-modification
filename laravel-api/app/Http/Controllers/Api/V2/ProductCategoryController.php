<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Catalog\ProductCatalogService;
use Illuminate\Http\JsonResponse;

class ProductCategoryController extends Controller
{
    public function __construct(private readonly ProductCatalogService $catalog) {}

    public function index(): JsonResponse
    {
        return response()->json($this->catalog->listCategories());
    }
}
