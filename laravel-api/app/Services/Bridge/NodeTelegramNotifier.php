<?php

namespace App\Services\Bridge;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * 通过 Node api-server 发送论坛/订单 Telegram 通知（逻辑仍在 telegram.js）
 */
class NodeTelegramNotifier
{
    public function notifyForumPost(array $post): void
    {
        $this->post('/api/internal/telegram/forum-post', $post);
    }

    public function notifyForumReply(array $reply, array $post, ?array $parentReply = null): void
    {
        $this->post('/api/internal/telegram/forum-reply', [
            'reply' => $reply,
            'post' => $post,
            'parentReply' => $parentReply,
        ]);
    }

    public function notifyOrderPaid(array $order): void
    {
        $this->post('/api/internal/telegram/order-paid', $order);
    }

    private function post(string $path, array $payload): void
    {
        $secret = env('NODE_INTERNAL_SECRET');
        if (! $secret) {
            Log::warning('[Telegram] NODE_INTERNAL_SECRET not set, skip notify', ['path' => $path]);

            return;
        }

        $base = rtrim(env('LEGACY_NODE_URL', 'http://127.0.0.1:3000'), '/');

        try {
            Http::timeout(8)
                ->withHeaders(['X-Internal-Secret' => $secret])
                ->post($base.$path, $payload)
                ->throw();
        } catch (\Throwable $e) {
            Log::error('[Telegram] Node notify failed', [
                'path' => $path,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
