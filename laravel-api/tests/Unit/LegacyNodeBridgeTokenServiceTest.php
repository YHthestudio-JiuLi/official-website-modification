<?php

namespace Tests\Unit;

use App\Services\Bridge\LegacyNodeBridgeTokenService;
use Tests\TestCase;

class LegacyNodeBridgeTokenServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.legacy_node.internal_secret' => 'unit-test-bridge-secret']);
    }

    public function test_mint_includes_aud_and_uid(): void
    {
        $service = new LegacyNodeBridgeTokenService();
        $token = $service->mint(42, LegacyNodeBridgeTokenService::AUD_ADMIN, 900);

        $this->assertNotNull($token);
        [$payloadB64] = explode('.', $token, 2);
        $payloadJson = base64_decode(strtr($payloadB64, '-_', '+/'), true);
        $payload = json_decode($payloadJson, true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame(42, $payload['uid']);
        $this->assertSame(LegacyNodeBridgeTokenService::AUD_ADMIN, $payload['aud']);
        $this->assertGreaterThan(time(), $payload['exp']);
    }

    public function test_mint_rejects_unknown_aud(): void
    {
        $service = new LegacyNodeBridgeTokenService();
        $this->assertNull($service->mint(1, 'invalid-aud'));
    }

    public function test_admin_and_user_aud_are_distinct(): void
    {
        $service = new LegacyNodeBridgeTokenService();
        $adminToken = $service->mint(7, LegacyNodeBridgeTokenService::AUD_ADMIN);
        $userToken = $service->mint(7, LegacyNodeBridgeTokenService::AUD_USER);

        $this->assertNotSame($adminToken, $userToken);
    }
}
