<?php

namespace App\Http\Controllers\Api\V2\Bridge;

use App\Http\Controllers\Controller;
use App\Services\Bridge\LegacyNodeBridge;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** 设备验签、在线客服等：转发至旧 Node（迁移期桥接，仅限公开路径） */
class LegacyBridgeController extends Controller
{
    /** 允许经 Laravel 转发的 Node 路径前缀（不含 /api/） */
    private const ALLOWED_PREFIXES = [
        'chat/',
        'device/',
    ];

    public function __construct(private readonly LegacyNodeBridge $bridge) {}

    public function handle(Request $request, string $path = ''): Response|JsonResponse
    {
        $normalized = ltrim($path, '/');
        if (! $this->isAllowedBridgePath($normalized)) {
            return response()->json(['error' => 'Forbidden bridge path'], 403);
        }

        $full = '/api/'.$normalized;
        if ($request->getQueryString()) {
            $full .= '?'.$request->getQueryString();
        }
        $resp = $this->bridge->forward($request, $full);

        return response($resp->body(), $resp->status())
            ->withHeaders(collect($resp->headers())->mapWithKeys(fn ($v, $k) => [$k => $v[0] ?? ''])->all());
    }

    private function isAllowedBridgePath(string $path): bool
    {
        if ($path === 'csrf-token') {
            return true;
        }

        foreach (self::ALLOWED_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
