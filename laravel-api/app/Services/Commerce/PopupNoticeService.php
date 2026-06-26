<?php

namespace App\Services\Commerce;

use App\Models\PopupNotice;

class PopupNoticeService
{
    public function activePopup(): ?array
    {
        $row = PopupNotice::query()
            ->where('popup_enabled', true)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();

        return $row?->toArray();
    }

    public function activeDisplay(): ?array
    {
        $row = PopupNotice::query()
            ->where('display_enabled', true)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();

        return $row?->toArray();
    }

    public function list(): array
    {
        return PopupNotice::query()
            ->orderByDesc('id')
            ->get()
            ->map(fn ($n) => $this->normalizeNotice($n->toArray()))
            ->all();
    }

    public function create(array $data): array
    {
        [$popupEnabled, $displayEnabled] = $this->resolveScopeFlags($data, true);

        if ($popupEnabled) {
            PopupNotice::query()->update(['popup_enabled' => false]);
        }
        if ($displayEnabled) {
            PopupNotice::query()->update(['display_enabled' => false]);
        }

        $notice = PopupNotice::query()->create([
            'title' => trim((string) $data['title']),
            'content' => trim((string) $data['content']),
            'popup_enabled' => $popupEnabled,
            'display_enabled' => $displayEnabled,
            'enabled' => $popupEnabled || $displayEnabled,
        ]);

        return $this->normalizeNotice($notice->toArray());
    }

    public function update(int $id, array $data): array
    {
        $notice = PopupNotice::query()->findOrFail($id);
        [$popupEnabled, $displayEnabled] = $this->resolveScopeFlags($data, (bool) $notice->popup_enabled, (bool) $notice->display_enabled);

        if ($popupEnabled) {
            PopupNotice::query()->where('id', '!=', $id)->update(['popup_enabled' => false]);
        }
        if ($displayEnabled) {
            PopupNotice::query()->where('id', '!=', $id)->update(['display_enabled' => false]);
        }

        $notice->update([
            'title' => array_key_exists('title', $data) ? trim((string) $data['title']) : $notice->title,
            'content' => array_key_exists('content', $data) ? trim((string) $data['content']) : $notice->content,
            'popup_enabled' => $popupEnabled,
            'display_enabled' => $displayEnabled,
            'enabled' => $popupEnabled || $displayEnabled,
        ]);

        return $this->normalizeNotice($notice->fresh()->toArray());
    }

    public function delete(int $id): void
    {
        PopupNotice::query()->where('id', $id)->delete();
    }

    /** @return array{0: bool, 1: bool} */
    private function resolveScopeFlags(array $data, bool $defaultPopup, bool $defaultDisplay = true): array
    {
        $hasPopup = array_key_exists('popup_enabled', $data);
        $hasDisplay = array_key_exists('display_enabled', $data);
        if (! $hasPopup && ! $hasDisplay && array_key_exists('enabled', $data)) {
            $legacy = (bool) $data['enabled'];

            return [$legacy, $legacy];
        }

        return [
            $hasPopup ? (bool) $data['popup_enabled'] : $defaultPopup,
            $hasDisplay ? (bool) $data['display_enabled'] : $defaultDisplay,
        ];
    }

    private function normalizeNotice(array $row): array
    {
        $popup = (bool) ($row['popup_enabled'] ?? $row['enabled'] ?? false);
        $display = (bool) ($row['display_enabled'] ?? $row['enabled'] ?? false);
        $row['popup_enabled'] = $popup;
        $row['display_enabled'] = $display;
        $row['enabled'] = $popup || $display;

        return $row;
    }
}
