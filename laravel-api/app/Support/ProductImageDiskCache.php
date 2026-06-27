<?php

namespace App\Support;

/**
 * 商品图磁盘缓存：首次从 MySQL BLOB 读出后写入 storage，后续走文件 IO（可被 Nginx try_files 直接命中）
 */
class ProductImageDiskCache
{
    private const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    public static function directory(): string
    {
        $dir = storage_path('app/product-image-cache');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    public static function extensionForMime(string $mime): string
    {
        return match (strtolower(trim($mime))) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/jpeg', 'image/jpg' => 'jpg',
            default => 'jpg',
        };
    }

    /** @return array{path: string, mime: string}|null */
    public static function read(int $id): ?array
    {
        $path = self::findPath($id);
        if (! $path) {
            return null;
        }
        $metaPath = $path.'.meta';
        $mime = is_file($metaPath)
            ? trim((string) file_get_contents($metaPath))
            : self::mimeFromExtension(pathinfo($path, PATHINFO_EXTENSION));

        return ['path' => $path, 'mime' => $mime ?: 'image/jpeg'];
    }

    public static function write(int $id, string $binary, string $mime): string
    {
        self::forget($id);
        $ext = self::extensionForMime($mime);
        $path = self::directory().DIRECTORY_SEPARATOR.$id.'.'.$ext;
        file_put_contents($path, $binary);
        file_put_contents($path.'.meta', $mime);

        return $path;
    }

    public static function forget(int $id): void
    {
        foreach (self::EXTENSIONS as $ext) {
            $path = self::directory().DIRECTORY_SEPARATOR.$id.'.'.$ext;
            if (is_file($path)) {
                @unlink($path);
            }
            if (is_file($path.'.meta')) {
                @unlink($path.'.meta');
            }
        }
    }

    private static function findPath(int $id): ?string
    {
        foreach (self::EXTENSIONS as $ext) {
            $path = self::directory().DIRECTORY_SEPARATOR.$id.'.'.$ext;
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    private static function mimeFromExtension(string $ext): string
    {
        return match (strtolower($ext)) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            default => 'image/jpeg',
        };
    }
}
