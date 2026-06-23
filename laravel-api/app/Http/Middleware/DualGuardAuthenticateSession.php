<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 多 guard 会话校验：仅登出失效的 guard，不 flush 整个 session（避免前台/后台互相踢线）
 */
class DualGuardAuthenticateSession
{
    private const GUARDS = ['web', 'admin'];

    public function __construct(private readonly AuthFactory $auth) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->hasSession()) {
            return $next($request);
        }

        foreach (self::GUARDS as $guardName) {
            $this->validateGuardSession($request, $guardName);
        }

        $response = $next($request);

        foreach (self::GUARDS as $guardName) {
            $this->refreshGuardPasswordHash($request, $guardName);
        }

        return $response;
    }

    private function validateGuardSession(Request $request, string $guardName): void
    {
        $guard = $this->auth->guard($guardName);
        $user = $guard->user();

        if (! $user || ! $user->getAuthPassword()) {
            return;
        }

        $hashKey = $this->passwordHashKey($guardName);

        if (! $request->session()->has($hashKey)) {
            $request->session()->put($hashKey, $user->getAuthPassword());

            return;
        }

        if (! hash_equals((string) $request->session()->get($hashKey), $user->getAuthPassword())) {
            $guard->logout();
            $request->session()->forget($hashKey);
            $request->session()->forget($guard->getName());
        }
    }

    private function refreshGuardPasswordHash(Request $request, string $guardName): void
    {
        $guard = $this->auth->guard($guardName);
        $user = $guard->user();

        if (! $user || ! $user->getAuthPassword()) {
            return;
        }

        $request->session()->put($this->passwordHashKey($guardName), $user->getAuthPassword());
    }

    private function passwordHashKey(string $guardName): string
    {
        return 'password_hash_'.$guardName;
    }
}
