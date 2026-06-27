<?php

namespace App\Services\Catalog;

use App\Models\Product;
use App\Models\ProductCategory;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProductCatalogService
{
    public function __construct(
        private readonly ProductNormalizer $normalizer,
        private readonly ProductTranslator $translator,
    ) {}

    public function listProductsForApi(bool $translateEn = true, ?int $ownerUserId = null, ?int $limit = null): array
    {
        return $this->listProductsForApiLite($translateEn, $ownerUserId, $limit);
    }

    /**
     * 前台列表：不加载 features/specs 等大 JSON，显著减小响应与序列化耗时
     */
    public function listProductsForApiLite(bool $translateEn = true, ?int $ownerUserId = null, ?int $limit = null): array
    {
        $query = DB::table('products as p')
            ->leftJoin('product_categories as c', 'p.categoryId', '=', 'c.id')
            ->leftJoin('product_categories as sc', 'p.subCategoryId', '=', 'sc.id')
            ->select([
                'p.id',
                'p.name',
                'p.description',
                'p.image',
                'p.date',
                'p.price',
                'p.priceUsdt',
                'p.categoryId',
                'p.subCategoryId',
                'c.name as categoryName',
                'c.nameEn as categoryNameEn',
                'c.slug as categorySlug',
                'sc.name as subCategoryName',
                'sc.nameEn as subCategoryNameEn',
                'sc.slug as subCategorySlug',
            ])
            ->orderByDesc('p.date')
            ->orderByDesc('p.id');

        if ($ownerUserId !== null) {
            $query->where('p.createdByUserId', $ownerUserId);
        }
        if ($limit !== null && $limit > 0) {
            $query->limit($limit);
        }

        $out = [];
        foreach ($query->get() as $row) {
            $arr = (array) $row;
            $images = $this->normalizer->parseImages($arr['image'] ?? null);
            $item = [
                'id' => (int) $arr['id'],
                'name' => $arr['name'],
                'description' => $arr['description'],
                'image' => $images[0] ?? '',
                'images' => $images,
                'date' => $arr['date'],
                'price' => (float) ($arr['price'] ?? 0),
                'priceUsdt' => (float) ($arr['priceUsdt'] ?? $arr['price'] ?? 0),
                'categoryId' => $arr['categoryId'] !== null ? (int) $arr['categoryId'] : null,
                'subCategoryId' => $arr['subCategoryId'] !== null ? (int) $arr['subCategoryId'] : null,
                'categoryName' => $arr['categoryName'] ?? null,
                'categoryNameEn' => $arr['categoryNameEn'] ?? null,
                'categorySlug' => $arr['categorySlug'] ?? null,
                'subCategoryName' => $arr['subCategoryName'] ?? null,
                'subCategoryNameEn' => $arr['subCategoryNameEn'] ?? null,
                'subCategorySlug' => $arr['subCategorySlug'] ?? null,
            ];
            $out[] = $translateEn ? $this->translator->translateListItem($item) : $item;
        }

        return $out;
    }

    /** @deprecated 内部保留全量查询供详情等场景 */
    public function listProductsForApiFull(bool $translateEn = true, ?int $ownerUserId = null, ?int $limit = null): array
    {
        $query = $this->productQuery()->orderByDesc('p.date')->orderByDesc('p.id');
        if ($ownerUserId !== null) {
            $query->where('p.createdByUserId', $ownerUserId);
        }
        if ($limit !== null && $limit > 0) {
            $query->limit($limit);
        }
        $rows = $query->get();
        $normalized = $this->normalizer->normalizeMany($rows->map(fn ($r) => (array) $r)->all());

        return $this->translator->translateMany($normalized, $translateEn);
    }

    /**
     * 管理端列表：不加载 features/specs 等大 JSON，减轻响应体积与解析耗时
     */
    public function listProductsForAdminIndex(?int $ownerUserId = null): array
    {
        $query = DB::table('products as p')
            ->leftJoin('product_categories as c', 'p.categoryId', '=', 'c.id')
            ->leftJoin('product_categories as sc', 'p.subCategoryId', '=', 'sc.id')
            ->select([
                'p.id',
                'p.name',
                'p.description',
                'p.image',
                'p.date',
                'p.price',
                'p.priceUsdt',
                'p.categoryId',
                'p.subCategoryId',
                'c.name as categoryName',
                'c.nameEn as categoryNameEn',
                'c.slug as categorySlug',
                'sc.name as subCategoryName',
                'sc.nameEn as subCategoryNameEn',
                'sc.slug as subCategorySlug',
            ])
            ->orderByDesc('p.date')
            ->orderByDesc('p.id');

        if ($ownerUserId !== null) {
            $query->where('p.createdByUserId', $ownerUserId);
        }

        $out = [];
        foreach ($query->get() as $row) {
            $arr = (array) $row;
            $images = $this->normalizer->parseImages($arr['image'] ?? null);
            $out[] = [
                'id' => (int) $arr['id'],
                'name' => $arr['name'],
                'description' => $arr['description'],
                'image' => $images[0] ?? '',
                'images' => $images,
                'date' => $arr['date'],
                'price' => (float) ($arr['price'] ?? 0),
                'priceUsdt' => (float) ($arr['priceUsdt'] ?? $arr['price'] ?? 0),
                'categoryId' => $arr['categoryId'] !== null ? (int) $arr['categoryId'] : null,
                'subCategoryId' => $arr['subCategoryId'] !== null ? (int) $arr['subCategoryId'] : null,
                'categoryName' => $arr['categoryName'] ?? null,
                'categoryNameEn' => $arr['categoryNameEn'] ?? null,
                'categorySlug' => $arr['categorySlug'] ?? null,
                'subCategoryName' => $arr['subCategoryName'] ?? null,
                'subCategoryNameEn' => $arr['subCategoryNameEn'] ?? null,
                'subCategorySlug' => $arr['subCategorySlug'] ?? null,
            ];
        }

        return $out;
    }

    public function findProductForApi(int $id, bool $translateEn = true): ?array
    {
        $row = $this->productQuery()->where('p.id', $id)->first();
        if (! $row) {
            return null;
        }
        $normalized = $this->normalizer->normalize((array) $row);

        return $this->translator->translateProduct($normalized, $translateEn);
    }

    public function listCategories(): array
    {
        return DB::table('product_categories as c')
            ->leftJoin('product_categories as p', 'c.parentId', '=', 'p.id')
            ->select([
                'c.*',
                'p.name as parentName',
                'p.nameEn as parentNameEn',
            ])
            ->orderByRaw('CASE WHEN c.parentId IS NULL THEN c.sortOrder ELSE p.sortOrder END ASC')
            ->orderByRaw('CASE WHEN c.parentId IS NULL THEN c.id ELSE c.parentId END ASC')
            ->orderByRaw('(c.parentId IS NOT NULL) ASC')
            ->orderBy('c.sortOrder')
            ->orderBy('c.id')
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();
    }

    public function createProduct(array $data, ?int $createdByUserId = null): Product
    {
        $this->validateCategories($data['categoryId'] ?? null, $data['subCategoryId'] ?? null);
        $detail = $this->normalizer->serializeDetailJson($data);

        return Product::query()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'image' => $this->normalizer->serializeImageField($data['image'] ?? null),
            'date' => $data['date'] ?? now()->toDateString(),
            'price' => (float) ($data['priceUsdt'] ?? $data['price'] ?? 0),
            'priceUsdt' => (float) ($data['priceUsdt'] ?? $data['price'] ?? 0),
            'featuresJson' => $detail['featuresJson'],
            'specsJson' => $detail['specsJson'],
            'usageNoticeJson' => $detail['usageNoticeJson'],
            'configsJson' => $detail['configsJson'],
            'categoryId' => $data['categoryId'] ?? null,
            'subCategoryId' => $data['subCategoryId'] ?? null,
            'createdByUserId' => $createdByUserId,
        ]);
    }

    public function updateProduct(Product $product, array $data): Product
    {
        $this->validateCategories($data['categoryId'] ?? null, $data['subCategoryId'] ?? null);
        $detail = $this->normalizer->serializeDetailJson($data);

        $product->fill([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'image' => $this->normalizer->serializeImageField($data['image'] ?? null),
            'date' => $data['date'] ?? $product->date,
            'price' => (float) ($data['priceUsdt'] ?? $data['price'] ?? 0),
            'priceUsdt' => (float) ($data['priceUsdt'] ?? $data['price'] ?? 0),
            'featuresJson' => $detail['featuresJson'],
            'specsJson' => $detail['specsJson'],
            'usageNoticeJson' => $detail['usageNoticeJson'],
            'configsJson' => $detail['configsJson'],
            'categoryId' => $data['categoryId'] ?? null,
            'subCategoryId' => $data['subCategoryId'] ?? null,
        ]);
        $product->save();

        return $product;
    }

    public function createCategory(array $data): ProductCategory
    {
        $parentId = $data['parentId'] ?? null;
        $this->validateParent($parentId);

        $slug = $this->uniqueSlug($data['slug'] ?? null, $data['name']);

        return ProductCategory::query()->create([
            'name' => trim($data['name']),
            'nameEn' => isset($data['nameEn']) ? trim((string) $data['nameEn']) : null,
            'slug' => $slug,
            'sortOrder' => (int) ($data['sortOrder'] ?? 0),
            'parentId' => $parentId,
        ]);
    }

    public function updateCategory(ProductCategory $category, array $data): ProductCategory
    {
        $parentId = array_key_exists('parentId', $data) ? $data['parentId'] : $category->parentId;
        $this->validateParent($parentId, $category->id);

        if (isset($data['name'])) {
            $category->name = trim($data['name']);
        }
        if (array_key_exists('nameEn', $data)) {
            $category->nameEn = $data['nameEn'] ? trim((string) $data['nameEn']) : null;
        }
        if (isset($data['slug']) && trim($data['slug']) !== '') {
            $category->slug = $this->uniqueSlug($data['slug'], $category->name, $category->id);
        }
        if (isset($data['sortOrder'])) {
            $category->sortOrder = (int) $data['sortOrder'];
        }
        $category->parentId = $parentId;
        $category->save();

        return $category;
    }

    private function productQuery()
    {
        return DB::table('products as p')
            ->leftJoin('product_categories as c', 'p.categoryId', '=', 'c.id')
            ->leftJoin('product_categories as sc', 'p.subCategoryId', '=', 'sc.id')
            ->select([
                'p.*',
                'c.name as categoryName',
                'c.nameEn as categoryNameEn',
                'c.slug as categorySlug',
                'sc.name as subCategoryName',
                'sc.nameEn as subCategoryNameEn',
                'sc.slug as subCategorySlug',
            ]);
    }

    private function validateCategories(?int $categoryId, ?int $subCategoryId): void
    {
        if ($subCategoryId !== null && $categoryId === null) {
            throw ValidationException::withMessages(['subCategoryId' => ['Subcategory requires a parent category']]);
        }
        if ($subCategoryId === null) {
            return;
        }
        $sub = ProductCategory::query()->find($subCategoryId);
        if (! $sub || ! $sub->parentId) {
            throw ValidationException::withMessages(['subCategoryId' => ['Invalid subcategory']]);
        }
        if ((int) $sub->parentId !== (int) $categoryId) {
            throw ValidationException::withMessages(['subCategoryId' => ['Subcategory does not belong to the selected category']]);
        }
    }

    private function validateParent(?int $parentId, ?int $categoryId = null): void
    {
        if ($parentId === null) {
            return;
        }
        $parent = ProductCategory::query()->find($parentId);
        if (! $parent) {
            throw ValidationException::withMessages(['parentId' => ['Parent category not found']]);
        }
        if ($parent->parentId) {
            throw ValidationException::withMessages(['parentId' => ['Only two-level categories are supported']]);
        }
        if ($categoryId !== null && (int) $parentId === (int) $categoryId) {
            throw ValidationException::withMessages(['parentId' => ['Category cannot be its own parent']]);
        }
    }

    private function uniqueSlug(?string $slug, string $name, ?int $ignoreId = null): string
    {
        $base = trim($slug ?? '') ?: $this->slugify($name);
        $final = $base;
        $n = 1;
        while ($this->slugExists($final, $ignoreId)) {
            $final = $base.'-'.$n;
            $n++;
        }

        return $final;
    }

    private function slugExists(string $slug, ?int $ignoreId): bool
    {
        $q = ProductCategory::query()->where('slug', $slug);
        if ($ignoreId) {
            $q->where('id', '!=', $ignoreId);
        }

        return $q->exists();
    }

    private function slugify(string $text): string
    {
        $raw = strtolower(trim($text));
        $raw = preg_replace('/[^\p{L}\p{N}\s-]/u', '', $raw) ?? '';
        $raw = preg_replace('/[\s_]+/', '-', $raw) ?? '';
        $raw = trim($raw, '-');

        return $raw !== '' ? $raw : 'category';
    }
}
