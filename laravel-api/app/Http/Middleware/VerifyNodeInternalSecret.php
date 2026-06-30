<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Node 内部回调（Telegram 删帖等）校验共享密钥 */
class VerifyNodeInternalSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.legacy_node.internal_secret');
        if (! $secret) {
            return response()->json(['error' => 'Internal API disabled'], 503);
        }
        $provided = $request->header('X-Internal-Secret') ?? $request->input('secret');
        if (! is_string($provided) || ! hash_equals($secret, $provided)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
