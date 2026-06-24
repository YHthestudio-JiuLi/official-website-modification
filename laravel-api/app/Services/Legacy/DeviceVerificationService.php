<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
use Illuminate\Support\Facades\File;
use RuntimeException;

class DeviceVerificationService
{
    public function __construct(private readonly PyDbClient $db) {}

    public function getSettings(): array
    {
        return $this->db->call('deviceVerification.getSettings') ?? [];
    }

    public function updateSettings(int $verifyCooldownSeconds): array
    {
        return $this->db->call('deviceVerification.updateSettings', [
            'verify_cooldown_seconds' => $verifyCooldownSeconds,
        ]) ?? [];
    }

    /** @return array<int, array<string, mixed>> */
    public function listDevices(): array
    {
        return $this->db->call('deviceVerification.findAll') ?? [];
    }

    public function findById(int $id): ?array
    {
        return $this->db->call('deviceVerification.findById', ['id' => $id]);
    }

    public function findByDeviceId(string $deviceId): ?array
    {
        return $this->db->call('deviceVerification.findByDeviceId', ['device_id' => $deviceId]);
    }

    public function create(
        string $deviceId,
        int $maxVerifications,
        ?int $questionId,
        ?int $firmwareId,
        bool $isWhitelisted
    ): array {
        return $this->db->call('deviceVerification.create', [
            'device_id' => $deviceId,
            'max_verifications' => $maxVerifications,
            'question_id' => $questionId,
            'firmware_id' => $firmwareId,
            'is_whitelisted' => $isWhitelisted,
        ]) ?? [];
    }

    public function updateDevice(string $deviceId, array $payload): array
    {
        $existing = $this->findByDeviceId($deviceId);
        if (! $existing) {
            throw new RuntimeException('Device not found');
        }

        $newMax = (int) ($existing['max_verifications'] ?? 0);
        if (array_key_exists('max_verifications', $payload)) {
            $newMax = (int) $payload['max_verifications'];
        }
        if (array_key_exists('add_max_verifications', $payload)) {
            $newMax += (int) $payload['add_max_verifications'];
        }
        if ($newMax < 0 || $newMax > 1000000) {
            throw new RuntimeException('Invalid max_verifications');
        }

        $this->db->call('deviceVerification.updateMaxVerifications', [
            'device_id' => $deviceId,
            'max_verifications' => $newMax,
        ]);

        if (array_key_exists('question_id', $payload)) {
            $qid = $payload['question_id'] ? (int) $payload['question_id'] : null;
            $this->db->call('deviceVerification.updateQuestionId', [
                'device_id' => $deviceId,
                'question_id' => $qid,
            ]);
        }

        if (array_key_exists('firmware_id', $payload)) {
            $fid = $payload['firmware_id'] ? (int) $payload['firmware_id'] : null;
            $this->db->call('deviceVerification.updateFirmwareId', [
                'device_id' => $deviceId,
                'firmware_id' => $fid,
            ]);
        }

        if (array_key_exists('is_whitelisted', $payload)) {
            $this->db->call('deviceVerification.updateWhitelist', [
                'device_id' => $deviceId,
                'is_whitelisted' => (bool) $payload['is_whitelisted'],
            ]);
        }

        return [
            'device_id' => $deviceId,
            'max_verifications' => $newMax,
            'question_id' => array_key_exists('question_id', $payload)
                ? ($payload['question_id'] ? (int) $payload['question_id'] : null)
                : ($existing['question_id'] ?? null),
            'firmware_id' => array_key_exists('firmware_id', $payload)
                ? ($payload['firmware_id'] ? (int) $payload['firmware_id'] : null)
                : ($existing['firmware_id'] ?? null),
            'is_whitelisted' => array_key_exists('is_whitelisted', $payload)
                ? ((bool) $payload['is_whitelisted'] ? 1 : 0)
                : ($existing['is_whitelisted'] ?? 0),
        ];
    }

    public function delete(string $deviceId): void
    {
        $this->db->call('deviceVerification.delete', ['device_id' => $deviceId]);
    }

    public function resetCount(string $deviceId): void
    {
        $this->db->call('deviceVerification.resetCount', ['device_id' => $deviceId]);
    }

    public function getKeys(string $deviceId): ?array
    {
        return $this->db->call('deviceVerification.getKeys', ['device_id' => $deviceId]);
    }

    public function getLogs(string $deviceId, int $limit, int $offset): array
    {
        $logs = $this->db->call('deviceVerification.findLogsByDeviceId', [
            'device_id' => $deviceId,
            'limit' => $limit,
            'offset' => $offset,
        ]) ?? [];
        $total = (int) ($this->db->call('deviceVerification.countLogsByDeviceId', [
            'device_id' => $deviceId,
        ]) ?? 0);

        return ['logs' => $logs, 'total' => $total];
    }
}
