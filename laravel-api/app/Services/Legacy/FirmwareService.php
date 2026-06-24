<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
use Illuminate\Support\Facades\File;
use RuntimeException;

class FirmwareService
{
    /** 与 api-server.js ALLOWED_FIRMWARE_EXTS 保持一致 */
    private const ALLOWED_EXTS = [
        '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.xz',
        '.bin', '.img', '.deb', '.run', '.txt', '.md', '.json', '.yaml', '.yml',
    ];

    public function __construct(private readonly PyDbClient $db) {}

    public function listFirmwareFiles(): array
    {
        return $this->db->call('deviceVerification.listFirmwareFiles') ?? [];
    }

    public function listLocalFiles(): array
    {
        $dir = $this->firmwareUploadDir();
        if (! File::isDirectory($dir)) {
            return [];
        }

        $items = [];
        foreach (File::files($dir) as $file) {
            $name = $file->getFilename();
            if (str_starts_with($name, '.')) {
                continue;
            }
            $items[] = [
                'file_name' => $name,
                'file_size' => $file->getSize(),
                'modified_at' => date('c', $file->getMTime()),
            ];
        }

        usort($items, fn ($a, $b) => strcmp($b['modified_at'] ?? '', $a['modified_at'] ?? ''));

        return $items;
    }

    public function registerLocal(string $fileName, ?string $remark): array
    {
        $fileName = $this->normalizeFileName($fileName);
        $ext = '.'.strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (! in_array($ext, self::ALLOWED_EXTS, true)) {
            throw new RuntimeException('Unsupported firmware file type');
        }

        $abs = $this->firmwareUploadDir().DIRECTORY_SEPARATOR.$fileName;
        if (! File::isFile($abs)) {
            throw new RuntimeException('File not found on server');
        }

        $checksum = hash_file('sha256', $abs);
        $size = filesize($abs) ?: 0;

        $firmware = $this->db->call('deviceVerification.createFirmwareFile', [
            'file_name' => $fileName,
            'file_url' => "/uploads/nano-firmwares/{$fileName}",
            'file_size' => $size,
            'checksum_sha256' => $checksum,
            'remark' => $this->normalizeRemark($remark),
        ]);

        return $firmware ?? [];
    }

    public function updateRemark(int $id, ?string $remark): array
    {
        return $this->db->call('deviceVerification.updateFirmwareRemark', [
            'id' => $id,
            'remark' => $this->normalizeRemark($remark),
        ]) ?? [];
    }

    public function setDefault(int $id): array
    {
        return $this->db->call('deviceVerification.setDefaultFirmware', ['id' => $id]) ?? [];
    }

    public function delete(int $id): void
    {
        $this->db->call('deviceVerification.deleteFirmwareFile', ['id' => $id]);
    }

    private function firmwareUploadDir(): string
    {
        $root = rtrim(config('services.legacy_uploads.root'), DIRECTORY_SEPARATOR);

        return $root.DIRECTORY_SEPARATOR.'nano-firmwares';
    }

    private function normalizeFileName(string $fileName): string
    {
        $fileName = trim($fileName);
        if ($fileName === '' || strlen($fileName) > 255 || str_contains($fileName, '/') || str_contains($fileName, '\\')) {
            throw new RuntimeException('Invalid file_name');
        }

        return $fileName;
    }

    private function normalizeRemark(?string $remark): string
    {
        return mb_substr(trim((string) $remark), 0, 500);
    }
}
