<?php

namespace App\Services\Database;

use App\Exceptions\PyDbRpcException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Python FastAPI RPC 客户端（与根目录 database.js 协议一致）
 */
class PyDbClient
{
    public function call(string $op, array $args = []): mixed
    {
        $base = rtrim((string) config('services.py_db.url', 'http://127.0.0.1:5100'), '/');
        if ($base === '') {
            $base = 'http://127.0.0.1:5100';
        }

        // FastAPI 要求 args 为 JSON 对象；PHP 空数组 [] 会被编码成 [] 导致 422
        $rpcArgs = $args === [] ? (object) [] : $args;

        try {
            $response = Http::timeout(30)
                ->acceptJson()
                ->post("{$base}/rpc", [
                    'op' => $op,
                    'args' => $rpcArgs,
                ]);
        } catch (ConnectionException $e) {
            Log::error('[PyDbClient] connection failed', ['op' => $op, 'url' => $base, 'message' => $e->getMessage()]);
            throw new RuntimeException("Python 数据库服务不可用，请确认 yh-py 已启动（{$base}）");
        }

        $payload = $response->json();

        if (! $response->ok()) {
            $detail = is_array($payload)
                ? ($payload['detail'] ?? $payload['error'] ?? $payload['message'] ?? null)
                : null;
            throw new RuntimeException($this->formatRpcError($detail) ?: "Python DB backend error ({$response->status()})");
        }

        if (! is_array($payload) || ($payload['ok'] ?? false) !== true) {
            if (is_array($payload) && ! empty($payload['code'])) {
                throw new PyDbRpcException(
                    (string) $payload['code'],
                    (string) ($payload['detail'] ?? $payload['code']),
                    (int) ($payload['http_status'] ?? 400),
                );
            }
            $bodySnippet = substr((string) $response->body(), 0, 500);
            Log::warning('[PyDbClient] invalid RPC payload', ['op' => $op, 'status' => $response->status(), 'body' => $bodySnippet]);
            $message = is_array($payload) ? ($payload['error'] ?? 'Invalid RPC payload') : 'Invalid RPC payload';
            if ($payload === null && $bodySnippet !== '') {
                $message .= ': '.$bodySnippet;
            }
            throw new RuntimeException($message);
        }

        return $payload['result'] ?? null;
    }

    /** 将 FastAPI 校验错误等结构化为可读字符串 */
    private function formatRpcError(mixed $detail): ?string
    {
        if ($detail === null) {
            return null;
        }
        if (is_string($detail)) {
            return $detail;
        }
        if (is_array($detail)) {
            return json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'Invalid RPC payload';
        }

        return (string) $detail;
    }
}
