<?php

namespace App\Http\Controllers\Api\V2\Admin\Concerns;

use App\Services\Bridge\LegacyNodeBridge;
use App\Services\Bridge\LegacyNodeBridgeTokenService;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * 分片上传等仍依赖 Node 内存态的接口：由 Laravel 代发并附带桥接 token
 */
trait ForwardsLegacyNodeAdminRequests
{
    protected function forwardLegacyNodeAdmin(Request $request, string $legacyPath): JsonResponse|\Illuminate\Http\Response
    {
        /** @var LegacyNodeBridge $bridge */
        $bridge = app(LegacyNodeBridge::class);
        /** @var LegacyNodeBridgeTokenService $tokens */
        $tokens = app(LegacyNodeBridgeTokenService::class);

        $admin = Auth::guard('admin')->user();
        $token = $admin ? $tokens->mint((int) $admin->id) : null;

        $resp = $bridge->forward($request, $legacyPath, $token);

        return $this->legacyNodeResponse($resp);
    }

    protected function legacyNodeResponse(Response $resp): JsonResponse|\Illuminate\Http\Response
    {
        $headers = collect($resp->headers())
            ->mapWithKeys(fn ($v, $k) => [$k => $v[0] ?? ''])
            ->all();

        $contentType = $headers['Content-Type'] ?? 'application/json';

        return response($resp->body(), $resp->status())
            ->withHeaders($headers)
            ->header('Content-Type', $contentType);
    }
}
