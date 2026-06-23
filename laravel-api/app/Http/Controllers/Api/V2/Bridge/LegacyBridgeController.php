<?php

namespace App\Http\Controllers\Api\V2\Bridge;

use App\Http\Controllers\Controller;
use App\Services\Bridge\LegacyNodeBridge;
use Illuminate\Http\Request;

/** 设备验签、题库分片上传等：转发至旧 Node（迁移期桥接） */
class LegacyBridgeController extends Controller
{
    public function __construct(private readonly LegacyNodeBridge $bridge) {}

    public function handle(Request $request, string $path = ''): \Illuminate\Http\Response|\Illuminate\Http\JsonResponse
    {
        $full = '/api/'.ltrim($path, '/');
        if ($request->getQueryString()) {
            $full .= '?'.$request->getQueryString();
        }
        $resp = $this->bridge->forward($request, $full);

        return response($resp->body(), $resp->status())
            ->withHeaders(collect($resp->headers())->mapWithKeys(fn ($v, $k) => [$k => $v[0] ?? ''])->all());
    }
}
