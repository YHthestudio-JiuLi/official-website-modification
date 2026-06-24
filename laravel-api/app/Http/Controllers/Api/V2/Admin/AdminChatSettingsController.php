<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Bridge\NodeTelegramNotifier;
use App\Services\Legacy\ChatSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminChatSettingsController extends Controller
{
    public function __construct(
        private readonly ChatSettingsService $chat,
        private readonly NodeTelegramNotifier $telegram,
    ) {}

    public function communityLinks(): JsonResponse
    {
        try {
            return response()->json($this->chat->getCommunityLinks());
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateCommunityLinks(Request $request): JsonResponse
    {
        $data = $request->validate([
            'telegramGroupUrl' => ['nullable', 'string'],
            'qqGroupUrl' => ['nullable', 'string'],
        ]);

        try {
            $this->chat->updateCommunityLinks(
                (string) ($data['telegramGroupUrl'] ?? ''),
                (string) ($data['qqGroupUrl'] ?? ''),
            );

            return response()->json(['success' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function chatAdmins(): JsonResponse
    {
        try {
            return response()->json(['admins' => $this->chat->listSupportAdmins()]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateChatAdmin(Request $request, int $id): JsonResponse
    {
        $body = $request->all();

        try {
            $admin = $this->chat->updateAdmin(
                $id,
                isset($body['display_name']) ? (string) $body['display_name'] : null,
                isset($body['bio']) ? (string) $body['bio'] : null,
                isset($body['avatar_color']) ? (string) $body['avatar_color'] : null,
                array_key_exists('telegram_chat_id', $body) ? (string) ($body['telegram_chat_id'] ?? '') : null,
                array_key_exists('telegram_token', $body) ? (string) ($body['telegram_token'] ?? '') : null,
                array_key_exists('chatbot_enabled', $body) ? (bool) $body['chatbot_enabled'] : null,
            );

            $this->telegram->restartChatBots();

            return response()->json(['admin' => $admin]);
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateChatbot(Request $request, int $id): JsonResponse
    {
        $enabled = (bool) ($request->input('enabled') ?? false);

        try {
            $admin = $this->chat->updateChatbotEnabled($id, $enabled);
            $this->telegram->restartChatBots();

            return response()->json(['admin' => $admin]);
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }
}
