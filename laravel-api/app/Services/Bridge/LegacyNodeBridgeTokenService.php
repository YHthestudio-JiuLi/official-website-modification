<?php

namespace App\Services\Bridge;

/**
 * 签发 Node legacy 管理端桥接 token（与 api-server verifyLegacyNodeBridgeToken 算法一致）
 */
class LegacyNodeBridgeTokenService
{
    public function mint(int $userId, int $ttlSeconds = 3600): ?string
    {
        $secret = config('services.legacy_node.internal_secret');
        if (! $secret) {
            return null;
        }

        $payload = json_encode([
            'uid' => $userId,
            'exp' => time() + $ttlSeconds,
        ], JSON_THROW_ON_ERROR);
        $payloadB64 = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $sig = hash_hmac('sha256', $payloadB64, $secret);

        return $payloadB64.'.'.$sig;
    }
}
