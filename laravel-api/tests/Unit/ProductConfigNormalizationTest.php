<?php

namespace Tests\Unit;

use App\Services\Catalog\ProductNormalizer;
use PHPUnit\Framework\TestCase;

class ProductConfigNormalizationTest extends TestCase
{
    private ProductNormalizer $normalizer;

    private array $vectors;

    protected function setUp(): void
    {
        parent::setUp();
        $this->normalizer = new ProductNormalizer;
        $path = dirname(__DIR__, 3).'/tests/fixtures/product-config-vectors.json';
        $this->vectors = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_normalize_configs_matches_shared_vectors(): void
    {
        foreach ($this->vectors['normalize'] as $index => $case) {
            $raw = $case['input'];
            $expected = $case['expected'];

            $actual = array_map(
                static fn (array $row) => [
                    'id' => $row['id'],
                    'name' => $row['name'],
                    'priceUsdt' => (float) $row['priceUsdt'],
                ],
                $this->normalizer->normalizeConfigs($raw)
            );

            $this->assertEquals($expected, $actual, "normalize case #{$index}");
        }
    }

    public function test_resolve_checkout_config_matches_shared_vectors(): void
    {
        foreach ($this->vectors['resolveCheckout'] as $index => $case) {
            $product = $case['product'];
            $configId = $case['configId'];
            $expected = $case['expected'];

            if (isset($expected['error'])) {
                $this->expectException(\InvalidArgumentException::class);
                $this->normalizer->resolveCheckoutConfig($product, $configId);
                continue;
            }

            $actual = $this->normalizer->resolveCheckoutConfig($product, $configId);
            $this->assertEquals($expected['price'], $actual['price'], "resolve case #{$index} price");
            $this->assertSame($expected['configId'], $actual['configId'], "resolve case #{$index} configId");
            $this->assertSame($expected['configName'], $actual['configName'], "resolve case #{$index} configName");
        }
    }
}
