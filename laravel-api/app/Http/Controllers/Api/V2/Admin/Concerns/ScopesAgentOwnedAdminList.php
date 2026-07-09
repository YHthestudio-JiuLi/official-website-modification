<?php

namespace App\Http\Controllers\Api\V2\Admin\Concerns;

use App\Services\Agent\CreatorAttributionEnricher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 代理数据范围下的管理端列表：按创建人过滤并补充「添加人」 */
trait ScopesAgentOwnedAdminList
{
    protected function scopedOwnerId(Request $request): ?int
    {
        return $this->agentScope->isScopedAgent($request->user()) ? (int) $request->user()->id : null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    protected function enrichAdminListIfNeeded(array $rows, ?int $ownerId): array
    {
        if ($ownerId !== null || $rows === []) {
            return $rows;
        }

        return $this->creatorAttribution->enrichList($rows);
    }

    protected function jsonListResponse(array $rows, ?int $ownerId, string $key = 'items'): JsonResponse
    {
        return response()->json([$key => $this->enrichAdminListIfNeeded($rows, $ownerId)]);
    }
}
