<?php

namespace App\Services\Catalog;

/**
 * 商品英文展示翻译（对齐 Node translate.js 的简化逻辑）
 */
class ProductTranslator
{
    private const MAP = [
        '智能AI助手' => 'Smart AI Assistant',
        '云端协作平台' => 'Cloud Collaboration Platform',
        '数据分析系统' => 'Data Analysis System',
        '基于大语言模型的智能助手，提供24/7服务' => 'Intelligent assistant based on large language models, providing 24/7 service',
        '高效的团队协作工具，支持实时同步' => 'Efficient team collaboration tool with real-time synchronization',
        '强大的数据分析和可视化平台' => 'Powerful data analysis and visualization platform',
    ];

    public function translateProduct(array $product, bool $toEnglish = true): array
    {
        if (! $toEnglish) {
            return $product;
        }

        $out = $product;
        if (! empty($product['name'])) {
            $out['name'] = $this->translateText((string) $product['name']);
        }
        if (! empty($product['description'])) {
            $out['description'] = $this->translateText((string) $product['description']);
        }
        $out['featureCards'] = $this->translateCards($product['featureCards'] ?? []);
        $out['specCards'] = $this->translateCards($product['specCards'] ?? []);
        $out['usageNoticeLines'] = $this->translateUsageLines($product['usageNoticeLines'] ?? []);

        if (! empty($product['categoryNameEn'])) {
            $out['categoryName'] = $product['categoryNameEn'];
        } elseif (! empty($product['categoryName'])) {
            $out['categoryName'] = $this->translateText((string) $product['categoryName']);
        }
        if (! empty($product['subCategoryNameEn'])) {
            $out['subCategoryName'] = $product['subCategoryNameEn'];
        } elseif (! empty($product['subCategoryName'])) {
            $out['subCategoryName'] = $this->translateText((string) $product['subCategoryName']);
        }

        return $out;
    }

    /** @param array<int, array> $products */
    public function translateMany(array $products, bool $toEnglish = true): array
    {
        return array_map(fn ($p) => $this->translateProduct($p, $toEnglish), $products);
    }

    public function translateText(string $text): string
    {
        if ($text === '' || ! $this->containsChinese($text)) {
            return $text;
        }

        return self::MAP[$text] ?? $text;
    }

    private function containsChinese(string $str): bool
    {
        return (bool) preg_match('/[\x{4e00}-\x{9fa5}]/u', $str);
    }

    private function translateCards(array $cards): array
    {
        $out = [];
        foreach (array_slice($cards, 0, 12) as $card) {
            if (! is_array($card)) {
                continue;
            }
            $title = trim((string) ($card['title'] ?? ''));
            $description = trim((string) ($card['description'] ?? ''));
            $icon = trim((string) ($card['icon'] ?? '')) ?: 'fa-star';
            if ($title === '' && $description === '') {
                continue;
            }
            $out[] = [
                'title' => $title ? $this->translateText($title) : '',
                'description' => $description ? $this->translateText($description) : '',
                'icon' => $icon,
            ];
        }

        return $out;
    }

    private function translateUsageLines(array $lines): array
    {
        $out = [];
        foreach (array_slice($lines, 0, 20) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $text = trim((string) ($item['text'] ?? ''));
            if ($text === '') {
                continue;
            }
            $modeRaw = strtolower((string) ($item['mode'] ?? 'check'));
            $mode = in_array($modeRaw, ['ban', 'warn'], true) ? $modeRaw : 'check';
            $out[] = ['text' => $this->translateText($text), 'mode' => $mode];
        }

        return $out;
    }
}
