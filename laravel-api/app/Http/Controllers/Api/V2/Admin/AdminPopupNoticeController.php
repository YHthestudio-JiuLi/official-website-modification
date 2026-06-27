<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\PopupNoticeService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPopupNoticeController extends Controller
{
    public function __construct(private readonly PopupNoticeService $notices) {}

    public function index(): JsonResponse
    {
        return response()->json(['notices' => $this->notices->list()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string'],
            'content' => ['required', 'string'],
            'enabled' => ['nullable', 'boolean'],
            'popup_enabled' => ['nullable', 'boolean'],
            'display_enabled' => ['nullable', 'boolean'],
        ]);

        PublicApiCache::bump('popup');

        return response()->json(['notice' => $this->notices->create($data)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $notice = $this->notices->update($id, $request->all());
        PublicApiCache::bump('popup');

        return response()->json(['notice' => $notice]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->notices->delete($id);
        PublicApiCache::bump('popup');

        return response()->json(['success' => true]);
    }
}
