<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Exceptions\PyDbRpcException;
use App\Http\Controllers\Api\V2\Admin\Concerns\AssertsAgentOwnedResources;
use App\Http\Controllers\Api\V2\Admin\Concerns\ProvidesAgentLinkedCatalogServices;
use App\Http\Controllers\Api\V2\Admin\Concerns\ScopesAgentOwnedAdminList;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;
use App\Services\Legacy\DeviceVerificationService;
use App\Services\Legacy\FirmwareService;
use App\Services\Legacy\QuestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminDeviceVerificationController extends AdminAgentScopedResourceController implements ProvidesAgentLinkedCatalogServices
{
    use AssertsAgentOwnedResources;
    use ScopesAgentOwnedAdminList;

    public function __construct(
        private readonly DeviceVerificationService $devices,
        private readonly QuestionService $questions,
        private readonly FirmwareService $firmware,
        AgentDataScope $agentScope,
        CreatorAttributionEnricher $creatorAttribution,
    ) {
        parent::__construct($agentScope, $creatorAttribution);
    }

    public function questionService(): QuestionService
    {
        return $this->questions;
    }

    public function firmwareService(): FirmwareService
    {
        return $this->firmware;
    }

    public function settings(Request $request): JsonResponse
    {
        $this->denyScopedAgentSettings($request);

        try {
            return response()->json($this->devices->getSettings());
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $this->denyScopedAgentSettings($request);

        $sec = (int) $request->input('verify_cooldown_seconds');
        if ($sec < 0 || $sec > 365 * 24 * 3600) {
            return response()->json(['error' => 'Invalid verify_cooldown_seconds (0-31536000)'], 400);
        }

        $signingPrivateKey = null;
        if ($request->has('signing_private_key')) {
            $signingPrivateKey = (string) $request->input('signing_private_key');
        } elseif ($request->has('signing_private_key_b64')) {
            $signingPrivateKey = (string) $request->input('signing_private_key_b64');
        }

        try {
            $settings = $this->devices->updateSettings($sec, $signingPrivateKey);

            return response()->json(['ok' => true, ...$settings]);
        } catch (PyDbRpcException $e) {
            return response()->json(['error' => $e->getMessage(), 'code' => $e->rpcCode], $e->httpStatus);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $ownerId = $this->scopedOwnerId($request);
            $devices = $this->devices->listDevices($ownerId);

            return response()->json([
                'devices' => $this->enrichAdminListIfNeeded($devices, $ownerId),
            ]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $device = $this->findDeviceByIdOr404($id);
        $this->agentScope->assertCanManageDevice($request->user(), $device);

        return response()->json(['device' => $device]);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $deviceId = $this->normalizeDeviceId($request->input('device_id', ''));
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $maxV = (int) ($request->input('max_verifications') ?? 10);
        if ($maxV < 0 || $maxV > 1000000) {
            return response()->json(['error' => 'Invalid max_verifications'], 400);
        }

        $questionId = $request->filled('question_id') ? (int) $request->input('question_id') : null;
        $firmwareId = $request->filled('firmware_id') ? (int) $request->input('firmware_id') : null;
        $this->assertAgentOwnsLinkedResources($request, $questionId, $firmwareId);

        $isWhitelisted = $request->has('is_whitelisted')
            ? (bool) $request->input('is_whitelisted')
            : false;

        $fingerprint = $request->filled('device_fingerprint')
            ? trim((string) $request->input('device_fingerprint'))
            : null;
        $algoVersion = $request->filled('fingerprint_algo_version')
            ? trim((string) $request->input('fingerprint_algo_version'))
            : null;

        try {
            $device = $this->devices->create(
                $deviceId,
                $maxV,
                $questionId,
                $firmwareId,
                $isWhitelisted,
                $fingerprint,
                $algoVersion,
                (int) $request->user()->id
            );

            return response()->json(['ok' => true, 'device' => $device]);
        } catch (PyDbRpcException $e) {
            return response()->json(['error' => $e->getMessage(), 'code' => $e->rpcCode], $e->httpStatus);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function update(Request $request, string $deviceId): JsonResponse
    {
        try {
            $deviceId = $this->normalizeDeviceId($deviceId);
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $device = $this->findDeviceByDeviceIdOr404($deviceId);
        $this->agentScope->assertCanManageDevice($request->user(), $device);

        $payload = $request->only([
            'max_verifications',
            'add_max_verifications',
            'question_id',
            'firmware_id',
            'is_whitelisted',
            'device_fingerprint',
            'fingerprint_algo_version',
        ]);

        $questionId = array_key_exists('question_id', $payload)
            ? ($payload['question_id'] !== null && $payload['question_id'] !== '' ? (int) $payload['question_id'] : null)
            : null;
        $firmwareId = array_key_exists('firmware_id', $payload)
            ? ($payload['firmware_id'] !== null && $payload['firmware_id'] !== '' ? (int) $payload['firmware_id'] : null)
            : null;
        if (array_key_exists('question_id', $payload) || array_key_exists('firmware_id', $payload)) {
            $this->assertAgentOwnsLinkedResources($request, $questionId, $firmwareId);
        }

        try {
            $result = $this->devices->updateDevice($deviceId, $payload);

            return response()->json(['ok' => true, ...$result]);
        } catch (PyDbRpcException $e) {
            return response()->json(['error' => $e->getMessage(), 'code' => $e->rpcCode], $e->httpStatus);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function destroy(Request $request, string $deviceId): JsonResponse
    {
        $device = $this->resolveManagedDevice($request, $deviceId);
        if ($device instanceof JsonResponse) {
            return $device;
        }

        try {
            $this->devices->delete($deviceId);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function resetCount(Request $request, string $deviceId): JsonResponse
    {
        $device = $this->resolveManagedDevice($request, $deviceId);
        if ($device instanceof JsonResponse) {
            return $device;
        }

        try {
            $this->devices->resetCount($deviceId);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function logs(Request $request, string $deviceId): JsonResponse
    {
        $device = $this->resolveManagedDevice($request, $deviceId);
        if ($device instanceof JsonResponse) {
            return $device;
        }

        $limit = (int) ($request->query('limit') ?? 100);
        $offset = (int) ($request->query('offset') ?? 0);

        try {
            return response()->json($this->devices->getLogs($deviceId, $limit, $offset));
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    /** @return array<string, mixed> */
    private function findDeviceByIdOr404(int $id): array
    {
        try {
            $device = $this->devices->findById($id);
        } catch (\Throwable) {
            abort(503, 'Database service unavailable');
        }
        if (! $device) {
            abort(404, 'Device not found');
        }

        return $device;
    }

    /** @return array<string, mixed> */
    private function findDeviceByDeviceIdOr404(string $deviceId): array
    {
        try {
            $device = $this->devices->findByDeviceId($deviceId);
        } catch (\Throwable) {
            abort(503, 'Database service unavailable');
        }
        if (! $device) {
            abort(404, 'Device not found');
        }

        return $device;
    }

    /**
     * @return array<string, mixed>|JsonResponse
     */
    private function resolveManagedDevice(Request $request, string $rawDeviceId): array|JsonResponse
    {
        try {
            $deviceId = $this->normalizeDeviceId($rawDeviceId);
        } catch (RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        try {
            $device = $this->devices->findByDeviceId($deviceId);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
        if (! $device) {
            return response()->json(['error' => 'Device not found'], 404);
        }

        try {
            $this->agentScope->assertCanManageDevice($request->user(), $device);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['error' => 'Device not found'], 404);
        }

        return $device;
    }

    /** 代理账户不可访问设备验证全局设置 */
    private function denyScopedAgentSettings(Request $request): void
    {
        if ($this->agentScope->isScopedAgent($request->user())) {
            abort(403, 'Agents cannot access device verification global settings');
        }
    }

    /** 管理端设备 ID：备注标签，禁止 URL 危险字符；指纹格式由 Python RPC 校验。 */
    private function normalizeDeviceId(mixed $value): string
    {
        $deviceId = trim((string) $value);
        if ($deviceId === '') {
            throw new RuntimeException('device_id is required');
        }
        $len = mb_strlen($deviceId, 'UTF-8');
        if ($len < 2 || $len > 128) {
            throw new RuntimeException('device_id length must be 2-128 characters');
        }
        if (preg_match('/[\/\\\\?#&\\x00-\\x1F]/u', $deviceId)) {
            throw new RuntimeException('device_id contains invalid characters');
        }

        return $deviceId;
    }
}
