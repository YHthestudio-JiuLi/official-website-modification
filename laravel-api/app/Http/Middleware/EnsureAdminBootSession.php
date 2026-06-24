<?php

namespace App\Http\Middleware;

use App\Services\Auth\AdminBootService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * 管理端会话绑定进程启动标识：Laravel/PM2 重启后旧 session 自动失效
 */
class EnsureAdminBootSession
{
    public function __construct(private readonly AdminBootService $boot) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! Auth::guard('admin')->check()) {
            return $next($request);
        }

        $expected = $this->boot->current();
        $sessionBoot = $request->session()->get('admin_boot_id');

        // 升级前旧会话无 boot_id：首次请求补写，避免整站 401
        if (! is_string($sessionBoot) || $sessionBoot === '') {
            $request->session()->put('admin_boot_id', $expected);

            return $next($request);
        }

        // 服务重启后 boot_id 变化：强制重新登录
        if ($sessionBoot !== $expected) {
            Auth::guard('admin')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'error' => 'Session expired',
                'code' => 'ADMIN_BOOT_INVALID',
            ], 401);
        }

        return $next($request);
    }
}
