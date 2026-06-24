<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * 管理端会话与进程启动绑定：服务重启后 boot id 变化，旧 session 失效
 */
class AdminBootService
{
    private const BOOT_FILE = 'framework/admin_boot_id';

    public function current(): string
    {
        $fromEnv = env('ADMIN_BOOT_ID');
        if (is_string($fromEnv) && $fromEnv !== '') {
            return $fromEnv;
        }

        $path = storage_path(self::BOOT_FILE);
        if (File::exists($path)) {
            return trim((string) File::get($path));
        }

        $bootId = (string) Str::uuid();
        File::ensureDirectoryExists(dirname($path));
        File::put($path, $bootId);

        return $bootId;
    }

    public function rotateFile(): string
    {
        $bootId = (string) (microtime(true) * 1000000);
        $path = storage_path(self::BOOT_FILE);
        File::ensureDirectoryExists(dirname($path));
        File::put($path, $bootId);

        return $bootId;
    }
}
