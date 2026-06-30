<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PopupNoticeService;
use App\Support\PublicReadResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PopupNoticeController extends Controller
{
    public function __construct(private readonly PopupNoticeService $notices) {}

    public function active(Request $request): JsonResponse
    {
        $scope = strtolower((string) $request->query('scope', 'popup'));
        $notice = $scope === 'display'
            ? $this->notices->activeDisplay()
            : $this->notices->activePopup();

        return PublicReadResponse::jsonNoStore(['notice' => $notice]);
    }
}
