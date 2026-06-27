<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * 公开读接口短缓存：版本号失效，避免逐 key 清理
 */
class PublicApiCache
{
    public const TTL_SECONDS = 120;

    /** 变更较少的公开数据可缓存更久 */
    public const TTL_CATALOG_SECONDS = 300;

    public static function remember(string $namespace, string $part, callable $callback, int $ttl = self::TTL_SECONDS): mixed
    {
        $key = self::key($namespace, $part);

        return Cache::remember($key, $ttl, $callback);
    }

    public static function key(string $namespace, string $part): string
    {
        $version = (int) Cache::get(self::versionKey($namespace), 1);

        return "public:{$namespace}:v{$version}:{$part}";
    }

    public static function bump(string $namespace): void
    {
        $versionKey = self::versionKey($namespace);
        $next = ((int) Cache::get($versionKey, 1)) + 1;
        Cache::forever($versionKey, $next);
    }

    private static function versionKey(string $namespace): string
    {
        return "public:ver:{$namespace}";
    }
}
