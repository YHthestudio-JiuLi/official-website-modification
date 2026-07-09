<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Api\V2\Admin\Concerns\ForwardsLegacyNodeAdminRequests;
use App\Http\Controllers\Api\V2\Admin\Concerns\ScopesAgentOwnedAdminList;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;
use App\Services\Legacy\FirmwareService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminFirmwareController extends AdminAgentScopedResourceController
{
    use ForwardsLegacyNodeAdminRequests;
    use ScopesAgentOwnedAdminList;

    public function __construct(
        private readonly FirmwareService $firmware,
        AgentDataScope $agentScope,
        CreatorAttributionEnricher $creatorAttribution,
    ) {
        parent::__construct($agentScope, $creatorAttribution);
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $ownerId = $this->scopedOwnerId($request);
            $items = $this->firmware->listFirmwareFiles($ownerId);

            return $this->jsonListResponse($items, $ownerId);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    public function localFiles(Request $request): JsonResponse
    {
        if ($this->agentScope->isScopedAgent($request->user())) {
            return response()->json(['error' => 'Agents cannot list server firmware files'], 403);
        }

        try {
            return response()->json(['items' => $this->firmware->listLocalFiles()]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Failed to list local firmware files'], 500);
        }
    }

    public function registerLocal(Request $request): JsonResponse
    {
        if ($this->agentScope->isScopedAgent($request->user())) {
            return response()->json(['error' => 'Agents cannot register server firmware files'], 403);
        }

        $fileName = (string) ($request->input('file_name') ?? '');

        try {
            $firmware = $this->firmware->registerLocal(
                $fileName,
                $request->input('remark'),
                (int) $request->user()->id
            );

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

    public function setDefault(Request $request, int $id): JsonResponse
    {
        if ($this->agentScope->isScopedAgent($request->user())) {
            return response()->json(['error' => 'Agents cannot set platform default firmware'], 403);
        }

        $this->assertCanManageFirmwareById($request, $id);

        try {
            $this->firmware->setDefault($id);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateRemark(Request $request, int $id): JsonResponse
    {
        $this->assertCanManageFirmwareById($request, $id);

        try {
            $firmware = $this->firmware->updateRemark($id, $request->input('remark'));

            return response()->json(['ok' => true, 'firmware' => $firmware]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->assertCanManageFirmwareById($request, $id);

        try {
            $this->firmware->delete($id);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    private function assertCanManageFirmwareById(Request $request, int $id): void
    {
        $firmware = $this->firmware->findById($id);
        if (! $firmware) {
            abort(404, 'Firmware not found');
        }
        $this->agentScope->assertCanManageFirmware($request->user(), $firmware);
    }
}
