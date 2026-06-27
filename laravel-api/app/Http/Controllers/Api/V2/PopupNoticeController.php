<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PopupNoticeService;
use Illuminate\Http\JsonResponse;

class PopupNoticeController extends Controller
{
    public function __construct(private readonly PopupNoticeService $notices) {}

    public function active(): JsonResponse
    {
        return response()->json(['notice' => $this->notices->active()]);
    }
}
