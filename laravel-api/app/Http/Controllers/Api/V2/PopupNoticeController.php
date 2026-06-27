<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PopupNoticeService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PopupNoticeController extends Controller
{
    public function __construct(private readonly PopupNoticeService $notices) {}

    public function active(Request $request): JsonResponse
    {
        $scope = strtolower((string) $request->query('scope', 'popup'));
        $part = $scope === 'display' ? 'display' : 'popup';
        $notice = PublicApiCache::remember('popup', $part, fn () => (
            $scope === 'display'
                ? $this->notices->activeDisplay()
                : $this->notices->activePopup()
        ));

        return response()
            ->json(['notice' => $notice])
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }
}
