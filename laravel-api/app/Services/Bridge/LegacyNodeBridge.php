<?php

namespace App\Services\Bridge;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * 将尚未完全移植的复杂接口（设备验签、题库分片上传等）转发至旧 Node 服务
 */
class LegacyNodeBridge
{
    public function forward(Request $request, string $path, ?string $legacyAdminToken = null): \Illuminate\Http\Client\Response
    {
        $base = rtrim(config('services.legacy_node.url', 'http://127.0.0.1:3000'), '/');
        $url = $base.$path;
        $method = strtolower($request->method());

        $headers = collect($request->headers->all())
            ->except(['host', 'content-length'])
            ->map(fn ($v) => $v[0] ?? '')
            ->all();

        if ($legacyAdminToken) {
            $headers['X-Legacy-Node-Token'] = $legacyAdminToken;
        }

        // 浏览器 Cookie 不应传给 Node；multipart 时须去掉 Content-Type 让客户端库自动生成 boundary
        unset($headers['cookie'], $headers['Cookie'], $headers['content-type'], $headers['Content-Type']);

        $http = Http::withOptions(['verify' => false])
            ->timeout($this->forwardTimeout($request, $path))
            ->withHeaders($headers);

        if ($request->isMethod('GET')) {
            return $http->get($url, $request->query());
        }

        if ($request->allFiles()) {
            $multipart = [];
            $fileKeys = array_keys($request->allFiles());

            // 文本字段须先于文件：Node multer 在解析 chunk 时依赖 uploadId/chunkIndex 已写入 req.body
            foreach ($request->except($fileKeys) as $k => $v) {
                if (is_array($v)) {
                    $multipart[] = ['name' => $k, 'contents' => json_encode($v)];
                } elseif ($v !== null) {
                    $multipart[] = ['name' => $k, 'contents' => (string) $v];
                }
            }

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

            return $http->send($method, $url, ['multipart' => $multipart]);
        }

        $body = $request->getContent();
        if ($body === '' || $body === false) {
            $body = json_encode($request->all() ?: new \stdClass);
        }

        return $http
            ->withBody($body, $request->header('Content-Type', 'application/json'))
            ->send($method, $url);
    }

    /** 分片合并可能耗时数分钟，须拉长超时 */
    private function forwardTimeout(Request $request, string $path): int
    {
        if ($request->allFiles()) {
            return 7200;
        }
        if (str_contains($path, '/upload/complete')) {
            return 3600;
        }

        return 120;
    }
}
