<?php

namespace App\Support;

/**
 * 商品图磁盘缓存：首次从 MySQL BLOB 读出后写入 storage，后续走文件 IO（可被 Nginx try_files 直接命中）
 */
class ProductImageDiskCache
{
    private const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    private const MAX_RENDER_WIDTH = 1280;
    private const WEBP_QUALITY = 82;
    private const OPTIMIZE_THRESHOLD_BYTES = 350000;

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
        [$optimized, $mime] = self::optimizeBinary($binary, $mime);
        $ext = self::extensionForMime($mime);
        $path = self::directory().DIRECTORY_SEPARATOR.$id.'.'.$ext;
        file_put_contents($path, $optimized);
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

    /**
     * 将超大图片压缩到 WebP（优先）并限制宽度，显著降低公网下载耗时。
     *
     * @return array{0: string, 1: string}
     */
    private static function optimizeBinary(string $binary, string $mime): array
    {
        if (strlen($binary) < self::OPTIMIZE_THRESHOLD_BYTES) {
            return [$binary, $mime];
        }
        if (! function_exists('imagecreatefromstring')) {
            return [$binary, $mime];
        }

        $src = @imagecreatefromstring($binary);
        if (! $src) {
            return [$binary, $mime];
        }

        try {
            $width = imagesx($src);
            $height = imagesy($src);
            if ($width <= 0 || $height <= 0) {
                return [$binary, $mime];
            }

            $targetWidth = min($width, self::MAX_RENDER_WIDTH);
            $targetHeight = (int) round(($height * $targetWidth) / $width);
            $dst = imagecreatetruecolor($targetWidth, $targetHeight);
            if (! $dst) {
                return [$binary, $mime];
            }

            try {
                imagealphablending($dst, false);
                imagesavealpha($dst, true);
                $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
                imagefilledrectangle($dst, 0, 0, $targetWidth, $targetHeight, $transparent);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);

                ob_start();
                $ok = function_exists('imagewebp')
                    ? imagewebp($dst, null, self::WEBP_QUALITY)
                    : false;
                $out = ob_get_clean();
                if ($ok && is_string($out) && $out !== '' && strlen($out) < strlen($binary)) {
                    return [$out, 'image/webp'];
                }

                return [$binary, $mime];
            } finally {
                imagedestroy($dst);
            }
        } finally {
            imagedestroy($src);
        }
    }
}
