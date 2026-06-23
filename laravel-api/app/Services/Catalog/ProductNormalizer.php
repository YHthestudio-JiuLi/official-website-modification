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
            return array_values(array_filter($imageField));
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
                    return array_values(array_filter($parsed));
                }
            } catch (\Throwable) {
                // ignore
            }
        }

        return [$raw];
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
        ];
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
