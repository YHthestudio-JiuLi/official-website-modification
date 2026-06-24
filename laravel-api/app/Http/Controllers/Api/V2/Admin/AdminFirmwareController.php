<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Api\V2\Admin\Concerns\ForwardsLegacyNodeAdminRequests;
use App\Http\Controllers\Controller;
use App\Services\Legacy\FirmwareService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminFirmwareController extends Controller
{
    use ForwardsLegacyNodeAdminRequests;

    public function __construct(private readonly FirmwareService $firmware) {}

    public function index(): JsonResponse
    {
        try {
            return response()->json(['items' => $this->firmware->listFirmwareFiles()]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    public function localFiles(): JsonResponse
    {
        try {
            return response()->json(['items' => $this->firmware->listLocalFiles()]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Failed to list local firmware files'], 500);
        }
    }

    public function registerLocal(Request $request): JsonResponse
    {
        $fileName = (string) ($request->input('file_name') ?? '');

        try {
            $firmware = $this->firmware->registerLocal($fileName, $request->input('remark'));

            return response()->json(['ok' => true, 'firmware' => $firmware]);
        } catch (RuntimeException $e) {
            if (str_contains($e->getMessage(), 'already') || str_contains(strtolower($e->getMessage()), 'duplicate')) {
                return response()->json(['error' => 'Firmware already registered'], 409);
            }

            return response()->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function uploadInit(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/device-firmwares/upload/init');
    }

    public function uploadChunk(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/device-firmwares/upload/chunk');
    }

    public function uploadComplete(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/device-firmwares/upload/complete');
    }

    public function uploadLegacy(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/device-firmwares/upload');
    }

    public function setDefault(int $id): JsonResponse
    {
        try {
            $this->firmware->setDefault($id);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateRemark(Request $request, int $id): JsonResponse
    {
        try {
            $firmware = $this->firmware->updateRemark($id, $request->input('remark'));

            return response()->json(['ok' => true, 'firmware' => $firmware]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function destroy(int $id): JsonResponse
    {
        try {
            $this->firmware->delete($id);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }
}
