<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * 将默认 Auth 驱动切到指定 guard，便于 $request->user() 与 Spatie 权限中间件
 */
class UseAuthGuard
{
    public function handle(Request $request, Closure $next, string $guard = 'web'): Response
    {
        Auth::shouldUse($guard);

        return $next($request);
    }
}
