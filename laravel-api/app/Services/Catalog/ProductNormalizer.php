<?php

namespace App\Services\Catalog;

/**
 * 商品 JSON 字段解析与响应规范化（对齐 Node normalizeProductRecord）
 */
class ProductNormalizer
{
    public function normalize(array|object $product): array
    {
        $row = is_array($product) ? $product : (array) $product;
        $images = $this->parseImages($row['image'] ?? null);

        return array_merge($row, [
            'images' => $images,
            'image' => $images[0] ?? '',
            'featureCards' => $this->parseJsonArray($row['featureCards'] ?? $row['featuresJson'] ?? null),
            'specCards' => $this->parseJsonArray($row['specCards'] ?? $row['specsJson'] ?? null),
            'usageNoticeLines' => $this->parseJsonArray($row['usageNoticeLines'] ?? $row['usageNoticeJson'] ?? null),
            'configs' => $this->normalizeConfigs($row['configs'] ?? $row['configsJson'] ?? null),
        ]);
    }

    /** @param iterable<int, array|object> $products */
    public function normalizeMany(iterable $products): array
    {
        $out = [];
        foreach ($products as $product) {
            $out[] = $this->normalize($product);
        }

        return $out;
    }

    public function parseImages(mixed $imageField): array
    {
        if (! $imageField) {
            return [];
        }
        if (is_array($imageField)) {
            return array_values(array_filter(array_map(
                fn ($u) => $this->normalizeImageUrl((string) $u),
                $imageField
            )));
        }
        if (! is_string($imageField)) {
            return [];
        }
        $raw = trim($imageField);
        if ($raw === '') {
            return [];
        }
        if (str_starts_with($raw, '[')) {
            try {
                $parsed = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
                if (is_array($parsed)) {
                    return array_values(array_filter(array_map(
                        fn ($u) => $this->normalizeImageUrl((string) $u),
                        $parsed
                    )));
                }
            } catch (\Throwable) {
                // ignore
            }
        }

        return [$this->normalizeImageUrl($raw)];
    }

    public function normalizeImageUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }
        if (preg_match('#^/api/product-images/(\d+)$#', $url, $m)) {
            return '/api/v2/product-images/'.$m[1];
        }

        return $url;
    }

    public function parseJsonArray(mixed $raw): array
    {
        if (! $raw) {
            return [];
        }
        if (is_array($raw)) {
            return $raw;
        }
        if (! is_string($raw)) {
            return [];
        }
        try {
            $parsed = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

            return is_array($parsed) ? $parsed : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** 写入数据库用的 JSON 字段 */
    public function serializeDetailJson(array $body): array
    {
        $toJson = static fn ($value) => is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : null;

        return [
            'featuresJson' => $toJson($body['featureCards'] ?? null),
            'specsJson' => $toJson($body['specCards'] ?? null),
            'usageNoticeJson' => $toJson($body['usageNoticeLines'] ?? null),
            'configsJson' => $toJson($this->normalizeConfigs($body['configs'] ?? null)),
        ];
    }

    /**
     * 规范化商品配置项：id、名称、USDT 价格
     *
     * @return list<array{id: string, name: string, priceUsdt: float}>
     */
    public function normalizeConfigs(mixed $raw): array
    {
        $items = $this->parseJsonArray($raw);
        $out = [];
        foreach ($items as $cfg) {
            if (! is_array($cfg)) {
                continue;
            }
            $name = trim((string) ($cfg['name'] ?? ''));
            $id = trim((string) ($cfg['id'] ?? ''));
            if ($name === '' || $id === '') {
                continue;
            }
            $out[] = [
                'id' => $id,
                'name' => $name,
                'priceUsdt' => (float) ($cfg['priceUsdt'] ?? $cfg['price'] ?? 0),
            ];
        }

        return $out;
    }

    /**
     * 下单时解析所选配置；无配置则使用商品基础价
     *
     * @return array{price: float, configId: ?string, configName: ?string}
     */
    public function resolveCheckoutConfig(array $product, ?string $configId): array
    {
        $configs = $this->normalizeConfigs($product['configs'] ?? $product['configsJson'] ?? null);
        if ($configs === []) {
            return [
                'price' => (float) ($product['priceUsdt'] ?? $product['price'] ?? 0),
                'configId' => null,
                'configName' => null,
            ];
        }
        $configId = trim((string) ($configId ?? ''));
        if ($configId === '') {
            throw new \InvalidArgumentException('Configuration required');
        }
        foreach ($configs as $cfg) {
            if ($cfg['id'] === $configId) {
                return [
                    'price' => (float) $cfg['priceUsdt'],
                    'configId' => $configId,
                    'configName' => $cfg['name'],
                ];
            }
        }

        throw new \InvalidArgumentException('Invalid configuration');
    }

    /** 多图存库：JSON 字符串或单 URL */
    public function serializeImageField(mixed $image): ?string
    {
        if (is_array($image)) {
            $urls = array_values(array_filter($image));

            return $urls === [] ? null : json_encode($urls, JSON_UNESCAPED_UNICODE);
        }

        return is_string($image) && trim($image) !== '' ? trim($image) : null;
    }
}
