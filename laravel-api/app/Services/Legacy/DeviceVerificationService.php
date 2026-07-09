<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
use RuntimeException;

class DeviceVerificationService
{
    public function __construct(private readonly PyDbClient $db) {}

    public function getSettings(): array
    {
        return $this->db->call('deviceVerification.getSettings') ?? [];
    }

    public function updateSettings(int $verifyCooldownSeconds, ?string $signingPrivateKey = null): array
    {
        $payload = ['verify_cooldown_seconds' => $verifyCooldownSeconds];
        if ($signingPrivateKey !== null && trim($signingPrivateKey) !== '') {
            $payload['signing_private_key'] = $signingPrivateKey;
        }

        return $this->db->call('deviceVerification.updateSettings', $payload) ?? [];
    }

    /** @return array<int, array<string, mixed>> */
    public function listDevices(?int $createdByUserId = null): array
    {
        $args = [];
        if ($createdByUserId !== null) {
            $args['created_by_user_id'] = $createdByUserId;
        }

        return $this->db->call('deviceVerification.findAll', $args) ?? [];
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
        bool $isWhitelisted,
        ?string $deviceFingerprint = null,
        ?string $fingerprintAlgoVersion = null,
        ?int $createdByUserId = null
    ): array {
        $payload = [
            'device_id' => $deviceId,
            'max_verifications' => $maxVerifications,
            'question_id' => $questionId,
            'firmware_id' => $firmwareId,
            'is_whitelisted' => $isWhitelisted,
            'device_fingerprint' => $deviceFingerprint,
            'fingerprint_algo_version' => $fingerprintAlgoVersion,
        ];
        if ($createdByUserId !== null) {
            $payload['created_by_user_id'] = $createdByUserId;
        }

        return $this->db->call('deviceVerification.create', $payload) ?? [];
    }

    public function updateDevice(string $deviceId, array $payload): array
    {
        return $this->db->call('deviceVerification.patchDevice', [
            'device_id' => $deviceId,
            'payload' => $payload,
        ]) ?? [];
    }

    public function delete(string $deviceId): void
    {
        $this->db->call('deviceVerification.delete', ['device_id' => $deviceId]);
    }

    public function resetCount(string $deviceId): void
    {
        $this->db->call('deviceVerification.resetCount', ['device_id' => $deviceId]);
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
