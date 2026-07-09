<?php

namespace App\Services\Bridge;

/**
 * 签发 Node legacy bridge token（与 server/lib/bridge-token.js 算法一致）
 *
 * 契约：
 * - aud=admin 仅在 Laravel User::canAccessAdmin() 通过后签发（见 AuthController、ForwardsLegacyNodeAdminRequests）
 * - Node 侧 parseBridgeToken 强制校验 aud；bridge 路径另做 canAccessAdmin RPC（60s 缓存）
 * - aud=user 仅用于前台 establish，禁止访问 /api/admin/*
 */
class LegacyNodeBridgeTokenService
{
    public const AUD_ADMIN = 'admin';

    public const AUD_USER = 'user';

    /** 管理端上传桥接 token 有效期（秒） */
    public const ADMIN_TTL_SECONDS = 900;

    public function mint(int $userId, string $aud = self::AUD_ADMIN, ?int $ttlSeconds = null): ?string
    {
        if (! in_array($aud, [self::AUD_ADMIN, self::AUD_USER], true)) {
            return null;
        }

        $secret = config('services.legacy_node.internal_secret');
        if (! $secret) {
            return null;
        }

        if ($ttlSeconds === null) {
            $ttlSeconds = $aud === self::AUD_ADMIN ? self::ADMIN_TTL_SECONDS : 3600;
        }

        $payload = json_encode([
            'uid' => $userId,
            'aud' => $aud,
            'exp' => time() + $ttlSeconds,
        ], JSON_THROW_ON_ERROR);
        $payloadB64 = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $sig = hash_hmac('sha256', $payloadB64, $secret);

        return $payloadB64.'.'.$sig;
    }
}
