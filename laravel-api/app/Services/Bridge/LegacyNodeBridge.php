<?php

namespace App\Services\Bridge;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * 将尚未完全移植的复杂接口（设备验签、题库分片上传等）转发至旧 Node 服务
 */
class LegacyNodeBridge
{
    public function forward(Request $request, string $path): \Illuminate\Http\Client\Response
    {
        $base = rtrim(env('LEGACY_NODE_URL', 'http://127.0.0.1:3000'), '/');
        $url = $base.$path;
        $method = strtolower($request->method());

        $options = [
            'headers' => collect($request->headers->all())
                ->except(['host', 'content-length'])
                ->map(fn ($v) => $v[0] ?? '')
                ->all(),
        ];

        if ($request->isMethod('GET')) {
            return Http::withOptions(['verify' => false])->withHeaders($options['headers'])->get($url, $request->query());
        }

        if ($request->allFiles()) {
            $multipart = [];
            foreach ($request->allFiles() as $key => $file) {
                $files = is_array($file) ? $file : [$file];
                foreach ($files as $idx => $f) {
                    $multipart[] = [
                        'name' => is_array($file) ? "{$key}[{$idx}]" : $key,
                        'contents' => fopen($f->getRealPath(), 'r'),
                        'filename' => $f->getClientOriginalName(),
                    ];
                }
            }
            foreach ($request->except(array_keys($request->allFiles())) as $k => $v) {
                $multipart[] = ['name' => $k, 'contents' => is_array($v) ? json_encode($v) : (string) $v];
            }

            return Http::withOptions(['verify' => false])->withHeaders($options['headers'])->send($method, $url, ['multipart' => $multipart]);
        }

        return Http::withOptions(['verify' => false])
            ->withHeaders($options['headers'])
            ->withBody($request->getContent() ?: json_encode($request->all()), $request->header('Content-Type', 'application/json'))
            ->send($method, $url);
    }
}
