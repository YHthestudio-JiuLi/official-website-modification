<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * 禁用账户不可访问 API（按路由区分 web / admin guard）
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        foreach (['web', 'admin'] as $guardName) {
            $user = Auth::guard($guardName)->user();
            if ($user && ($user->status ?? 'active') !== 'active') {
                Auth::guard($guardName)->logout();
            }
        }

        $guard = $this->resolveGuard($request);
        $user = Auth::guard($guard)->user();
        if ($user && ($user->status ?? 'active') !== 'active') {
            return response()->json(['message' => 'Account suspended'], 403);
        }

        return $next($request);
    }

    private function resolveGuard(Request $request): string
    {
        $path = $request->path();
        if (preg_match('#(^|/)auth/admin(/|$)|(^|/)admin(/|$)#', $path)) {
            return 'admin';
        }

        return 'web';
    }
}
