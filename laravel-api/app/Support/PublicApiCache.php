<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * 公开读接口短缓存：版本号失效，避免逐 key 清理
 */
class PublicApiCache
{
    public const TTL_SECONDS = 120;

    public const TTL_CATALOG_SECONDS = 300;

    public static function remember(string $namespace, string $part, callable $callback, int $ttl = self::TTL_SECONDS): mixed
    {
        $key = self::key($namespace, $part);

        try {
            return Cache::remember($key, $ttl, $callback);
        } catch (\Throwable $e) {
            self::reportCacheFailure('remember', $namespace, $part, $e);

            // 缓存异常时直接回源，避免公开读接口整体 500
            return $callback();
        }
    }

    public static function key(string $namespace, string $part): string
    {
        try {
            $version = (int) Cache::get(self::versionKey($namespace), 1);
        } catch (\Throwable $e) {
            self::reportCacheFailure('key', $namespace, $part, $e);
            $version = 1;
        }

        return "public:{$namespace}:v{$version}:{$part}";
    }

    public static function bump(string $namespace): void
    {
        $versionKey = self::versionKey($namespace);
        try {
            $next = ((int) Cache::get($versionKey, 1)) + 1;
            Cache::forever($versionKey, $next);
        } catch (\Throwable $e) {
            // bump 失败不影响主流程，只记录日志
            self::reportCacheFailure('bump', $namespace, $versionKey, $e);
        }
    }

    private static function versionKey(string $namespace): string
    {
        return "public:ver:{$namespace}";
    }

    private static function reportCacheFailure(string $operation, string $namespace, string $part, \Throwable $e): void
    {
        Log::warning('public_api_cache_failed', [
            'operation' => $operation,
            'namespace' => $namespace,
            'part' => $part,
            'message' => $e->getMessage(),
        ]);
    }
}
