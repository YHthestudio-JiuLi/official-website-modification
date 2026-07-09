<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StoredImage;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;
use App\Services\Catalog\ProductCatalogService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(
        private readonly ProductCatalogService $catalog,
        private readonly AgentDataScope $agentScope,
        private readonly CreatorAttributionEnricher $creatorAttribution,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $ownerId = $this->agentScope->isScopedAgent($user) ? $user->id : null;
        $rows = $this->catalog->listProductsForAdminIndex($ownerId);
        if ($ownerId !== null) {
            $rows = array_map(fn (array $row) => $this->stripCategoryFields($row), $rows);
        } elseif ($rows !== []) {
            $rows = $this->creatorAttribution->enrichList($rows, 'createdByUserId');
        }

        return response()->json($rows);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->find($id);
        if (! $product) {
            return response()->json(['error' => 'Product not found'], 404);
        }
        if ($this->agentScope->isScopedAgent($request->user())) {
            $this->agentScope->assertCanManageProduct($request->user(), $product);
        }

        $row = $this->catalog->findProductForApi($id, false);
        if (! $row) {
            return response()->json(['error' => 'Product not found'], 404);
        }
        if ($this->agentScope->isScopedAgent($request->user())) {
            $row = $this->stripCategoryFields($row);
        }

        return response()->json($row);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedProduct($request);
        $user = $request->user();
        $ownerId = $this->agentScope->isScopedAgent($user) ? $user->id : null;
        $this->catalog->createProduct($data, $ownerId);
        PublicApiCache::bump('catalog');

        return response()->json(['success' => true]);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $this->agentScope->assertCanManageProduct($request->user(), $product);
        $data = $this->validatedProduct($request);
        $this->catalog->updateProduct($product, $data);
        PublicApiCache::bump('catalog');

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->agentScope->assertCanManageProduct($request->user(), $product);
        $product->delete();
        PublicApiCache::bump('catalog');

        return response()->json(['success' => true]);
    }

    private function validatedProduct(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'image' => ['nullable'],
            'date' => ['nullable', 'string', 'max:64'],
            'priceUsdt' => ['nullable', 'numeric', 'min:0'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'categoryId' => ['nullable', 'integer'],
            'subCategoryId' => ['nullable', 'integer'],
            'featureCards' => ['nullable', 'array'],
            'specCards' => ['nullable', 'array'],
            'usageNoticeLines' => ['nullable', 'array'],
            'configs' => ['nullable', 'array'],
        ]);

        $validated['categoryId'] = $this->nullableInt($request->input('categoryId'));
        $validated['subCategoryId'] = $this->nullableInt($request->input('subCategoryId'));

        if ($this->agentScope->isScopedAgent($request->user())) {
            $validated['categoryId'] = null;
            $validated['subCategoryId'] = null;
        }

        return $validated;
    }

    /** 代理不展示分类信息 */
    private function stripCategoryFields(array $row): array
    {
        foreach ([
            'categoryId', 'subCategoryId', 'categoryName', 'categoryNameEn',
            'categorySlug', 'subCategoryName', 'subCategoryNameEn', 'subCategorySlug',
        ] as $key) {
            unset($row[$key]);
        }

        return $row;
    }

    private function nullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $n = (int) $raw;

        return $n > 0 ? $n : null;
    }
}
