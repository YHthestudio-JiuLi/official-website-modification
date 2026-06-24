<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Legacy\DeviceVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminDeviceVerificationController extends Controller
{
    public function __construct(private readonly DeviceVerificationService $devices) {}

    public function settings(): JsonResponse
    {
        try {
            return response()->json($this->devices->getSettings());
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $sec = (int) $request->input('verify_cooldown_seconds');
        if ($sec < 0 || $sec > 365 * 24 * 3600) {
            return response()->json(['error' => 'Invalid verify_cooldown_seconds (0-31536000)'], 400);
        }

        try {
            $settings = $this->devices->updateSettings($sec);

            return response()->json(['ok' => true, ...$settings]);
        } catch (\Throwable $e) {
            if (str_contains($e->getMessage(), 'verify_cooldown_seconds')) {
                return response()->json(['error' => $e->getMessage()], 400);
            }

            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function index(): JsonResponse
    {
        try {
            return response()->json(['devices' => $this->devices->listDevices()]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function show(int $id): JsonResponse
    {
        try {
            $device = $this->devices->findById($id);
            if (! $device) {
                return response()->json(['error' => 'Device not found'], 404);
            }

            return response()->json(['device' => $device]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function store(Request $request): JsonResponse
    {
        $deviceId = trim((string) $request->input('device_id', ''));
        if ($deviceId === '' || strlen($deviceId) < 4 || strlen($deviceId) > 128 || ! preg_match('/^[\w.:-]+$/', $deviceId)) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        $maxV = (int) ($request->input('max_verifications') ?? 10);
        if ($maxV < 0 || $maxV > 1000000) {
            return response()->json(['error' => 'Invalid max_verifications'], 400);
        }

        $questionId = $request->filled('question_id') ? (int) $request->input('question_id') : null;
        $firmwareId = $request->filled('firmware_id') ? (int) $request->input('firmware_id') : null;
        $isWhitelisted = $request->has('is_whitelisted')
            ? (bool) $request->input('is_whitelisted')
            : true;

        try {
            $device = $this->devices->create($deviceId, $maxV, $questionId, $firmwareId, $isWhitelisted);

            return response()->json(['ok' => true, 'device' => $device]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function update(Request $request, string $deviceId): JsonResponse
    {
        $deviceId = trim($deviceId);
        if (! preg_match('/^[\w.:-]+$/', $deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        try {
            $result = $this->devices->updateDevice($deviceId, $request->all());

            return response()->json(['ok' => true, ...$result]);
        } catch (RuntimeException $e) {
            if (str_contains($e->getMessage(), 'not found')) {
                return response()->json(['error' => 'Device not found'], 404);
            }
            if (str_contains($e->getMessage(), 'max_verifications')) {
                return response()->json(['error' => $e->getMessage()], 400);
            }

            return response()->json(['error' => $e->getMessage()], 400);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function destroy(string $deviceId): JsonResponse
    {
        $deviceId = trim($deviceId);
        if (! preg_match('/^[\w.:-]+$/', $deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        try {
            $this->devices->delete($deviceId);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function resetCount(string $deviceId): JsonResponse
    {
        $deviceId = trim($deviceId);
        if (! preg_match('/^[\w.:-]+$/', $deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        try {
            $this->devices->resetCount($deviceId);

            return response()->json(['ok' => true]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function keys(string $deviceId): JsonResponse
    {
        $deviceId = trim($deviceId);
        if (! preg_match('/^[\w.:-]+$/', $deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        try {
            $keys = $this->devices->getKeys($deviceId);
            if (! $keys) {
                return response()->json(['error' => 'Device not found'], 404);
            }

            return response()->json(['device_id' => $deviceId, ...$keys]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }

    public function logs(Request $request, string $deviceId): JsonResponse
    {
        $deviceId = trim($deviceId);
        if (! preg_match('/^[\w.:-]+$/', $deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            return response()->json(['error' => 'Invalid device_id format'], 400);
        }

        $limit = (int) ($request->query('limit') ?? 100);
        $offset = (int) ($request->query('offset') ?? 0);

        try {
            return response()->json($this->devices->getLogs($deviceId, $limit, $offset));
        } catch (\Throwable) {
            return response()->json(['error' => 'Database service unavailable'], 503);
        }
    }
}
