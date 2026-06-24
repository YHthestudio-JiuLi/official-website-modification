<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
use RuntimeException;

class ChatSettingsService
{
    public function __construct(private readonly PyDbClient $db) {}

    public function getCommunityLinks(): array
    {
        return $this->db->call('chatCommunitySettings.get') ?? [];
    }

    public function updateCommunityLinks(string $telegramGroupUrl, string $qqGroupUrl): void
    {
        $this->db->call('chatCommunitySettings.update', [
            'telegramGroupUrl' => $telegramGroupUrl,
            'qqGroupUrl' => $qqGroupUrl,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listSupportAdmins(): array
    {
        $all = $this->db->call('chatAdmins.findAll') ?? [];

        return array_values(array_filter($all, fn (array $a) => ($a['username'] ?? '') === 'support'));
    }

    public function updateAdmin(
        int $id,
        ?string $displayName,
        ?string $bio,
        ?string $avatarColor,
        ?string $telegramChatId,
        ?string $telegramToken,
        ?bool $chatbotEnabled
    ): array {
        $this->db->call('chatAdmins.update', [
            'id' => $id,
            'display_name' => $displayName,
            'bio' => $bio,
            'avatar_color' => $avatarColor,
            'telegram_chat_id' => $telegramChatId,
            'telegram_token' => $telegramToken,
            'chatbot_enabled' => $chatbotEnabled,
        ]);

        $admin = $this->db->call('chatAdmins.findById', ['id' => $id]);
        if (! $admin) {
            throw new RuntimeException('Admin not found');
        }

        return $admin;
    }

    public function updateChatbotEnabled(int $id, bool $enabled): array
    {
        $this->db->call('chatAdmins.updateChatbotEnabled', [
            'id' => $id,
            'enabled' => $enabled,
        ]);

        $admin = $this->db->call('chatAdmins.findById', ['id' => $id]);
        if (! $admin) {
            throw new RuntimeException('Admin not found');
        }

        return $admin;
    }
}
