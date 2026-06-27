<?php

namespace App\Services\Commerce;

use App\Models\PopupNotice;

class PopupNoticeService
{
    public function active(): ?array
    {
        $row = PopupNotice::query()->where('enabled', true)->orderByDesc('id')->first();

        return $row?->toArray();
    }

    public function list(): array
    {
        return PopupNotice::query()->orderByDesc('id')->get()->map(fn ($n) => $n->toArray())->all();
    }

    public function create(array $data): array
    {
        if (! empty($data['enabled'])) {
            PopupNotice::query()->update(['enabled' => false]);
        }

        return PopupNotice::query()->create([
            'title' => trim($data['title']),
            'content' => trim($data['content']),
            'enabled' => ! empty($data['enabled']),
        ])->toArray();
    }

    public function update(int $id, array $data): array
    {
        $notice = PopupNotice::query()->findOrFail($id);
        if (! empty($data['enabled'])) {
            PopupNotice::query()->where('id', '!=', $id)->update(['enabled' => false]);
        }
        $notice->update([
            'title' => $data['title'] ?? $notice->title,
            'content' => $data['content'] ?? $notice->content,
            'enabled' => array_key_exists('enabled', $data) ? (bool) $data['enabled'] : $notice->enabled,
        ]);

        return $notice->fresh()->toArray();
    }

    public function delete(int $id): void
    {
        PopupNotice::query()->where('id', $id)->delete();
    }
}
