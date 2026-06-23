<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use App\Services\Agent\AgentDataScope;
use App\Services\Catalog\ProductCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductCategoryController extends Controller
{
    public function __construct(
        private readonly ProductCatalogService $catalog,
        private readonly AgentDataScope $agentScope,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->denyScopedAgent($request);

        return response()->json($this->catalog->listCategories());
    }

    public function store(Request $request): JsonResponse
    {
        $this->denyScopedAgent($request);
        $data = $this->validated($request);
        $category = $this->catalog->createCategory($data);

        return response()->json(['success' => true, 'id' => $category->id]);
    }

    public function update(Request $request, ProductCategory $category): JsonResponse
    {
        $this->denyScopedAgent($request);
        $data = $this->validated($request, false);
        $this->catalog->updateCategory($category, $data);

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, ProductCategory $category): JsonResponse
    {
        $this->denyScopedAgent($request);
        $category->delete();

        return response()->json(['success' => true]);
    }

    private function denyScopedAgent(Request $request): void
    {
        if ($this->agentScope->isScopedAgent($request->user())) {
            abort(403, 'Agents cannot access product categories');
        }
    }

    private function validated(Request $request, bool $requireName = true): array
    {
        $rules = [
            'nameEn' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'sortOrder' => ['nullable', 'integer'],
            'parentId' => ['nullable', 'integer'],
        ];
        if ($requireName) {
            $rules['name'] = ['required', 'string', 'max:255'];
        } else {
            $rules['name'] = ['sometimes', 'string', 'max:255'];
        }

        $validated = $request->validate($rules);
        if (array_key_exists('parentId', $validated)) {
            $validated['parentId'] = $this->nullableInt($validated['parentId']);
        }

        return $validated;
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
