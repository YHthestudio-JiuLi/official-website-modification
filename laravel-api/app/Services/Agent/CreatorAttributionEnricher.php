<?php

namespace App\Services\Agent;

use App\Models\User;

/**
 * 为管理端列表补充「添加人」展示字段（仅管理员侧使用）
 */
class CreatorAttributionEnricher
{
    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    public function enrichList(array $items, string $userIdKey = 'created_by_user_id'): array
    {
        if ($items === []) {
            return [];
        }

        $ownerIds = [];
        foreach ($items as $item) {
            $raw = $item[$userIdKey] ?? null;
            if ($raw !== null && (int) $raw > 0) {
                $ownerIds[] = (int) $raw;
            }
        }

        $ownerIds = array_values(array_unique($ownerIds));
        $usernames = $ownerIds === []
            ? []
            : User::query()->whereIn('id', $ownerIds)->pluck('username', 'id')->all();

        return array_map(function (array $item) use ($userIdKey, $usernames): array {
            $uid = $item[$userIdKey] ?? null;
            $item['created_by_username'] = ($uid !== null && (int) $uid > 0)
                ? ($usernames[(int) $uid] ?? null)
                : null;

            return $item;
        }, $items);
    }
}
