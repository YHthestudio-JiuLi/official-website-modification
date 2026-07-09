<?php

namespace App\Services\Legacy;

use App\Exceptions\ResourceNotFoundException;
use App\Services\Database\PyDbClient;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class QuestionService
{
    public function __construct(private readonly PyDbClient $db) {}

    public function findAll(?int $createdByUserId = null): array
    {
        $args = [];
        if ($createdByUserId !== null) {
            $args['created_by_user_id'] = $createdByUserId;
        }

        $list = $this->db->call('questions.findAll', $args) ?? [];

        return array_map(fn (array $item) => $this->enrichWithFileSizes($item), $list);
    }

    public function findById(int $id): array
    {
        $question = $this->db->call('questions.findById', ['id' => $id]);
        if (! $question) {
            throw new ResourceNotFoundException('Question not found');
        }

        return $this->enrichWithFileSizes($question);
    }

    /** 代理编辑题库时仅允许更新名称与分类 */
    public function updateMetadata(int $id, string $name, ?string $categoryName): void
    {
        $this->db->call('questions.updateFields', [
            'id' => $id,
            'name' => $name,
            'category_name' => $categoryName,
        ]);
    }

    /**
     * 根据磁盘文件补充题库文件大小（编辑页展示用）
     */
    private function enrichWithFileSizes(array $item): array
    {
        $uploadsRoot = rtrim((string) config('services.legacy_uploads.root'), DIRECTORY_SEPARATOR);
        $dbSize = $this->fileSizeOnDisk($item['db_file_path'] ?? null, $uploadsRoot);
        $vectorSize = $this->fileSizeOnDisk($item['vector_file_path'] ?? null, $uploadsRoot);

        $item['db_file_size'] = $dbSize;
        $item['vector_file_size'] = $vectorSize;
        $item['total_file_size'] = ($dbSize ?? 0) + ($vectorSize ?? 0);

        return $item;
    }

    private function fileSizeOnDisk(?string $stored, string $uploadsRoot): ?int
    {
        if (! is_string($stored) || $stored === '') {
            return null;
        }
        $abs = $this->resolveUploadPath($uploadsRoot, $stored);
        if (! $abs || ! File::isFile($abs)) {
            return null;
        }

        return filesize($abs) ?: null;
    }

    /** 走 Python REST 删除（含上传目录清理），与 Node questionsService.delete 一致 */
    public function delete(int $id): void
    {
        $question = null;
        try {
            $question = $this->findById($id);
        } catch (\Throwable) {
            // 记录可能已不存在，仍尝试清理 uploads
        }

        $base = rtrim((string) config('services.py_db.url', 'http://127.0.0.1:5100'), '/');
        if ($base === '') {
            $base = 'http://127.0.0.1:5100';
        }

        try {
            $response = Http::timeout(120)
                ->acceptJson()
                ->delete("{$base}/api/questions/{$id}");
        } catch (\Throwable $e) {
            Log::error('[QuestionService] delete connection failed', ['id' => $id, 'message' => $e->getMessage()]);
            throw new RuntimeException('Python 题库服务不可用，请确认 yh-py 已启动');
        }

        if ($response->status() === 404) {
            throw new ResourceNotFoundException('Question not found');
        }

        if (! $response->ok()) {
            $detail = $response->json('detail') ?? $response->json('error') ?? $response->body();
            throw new RuntimeException(is_string($detail) ? $detail : 'Delete question failed');
        }

        // Python 删库后再清一次本机 uploads，防止路径不一致残留
        $this->removeQuestionFilesFromDisk($id, $question);
    }

    private function removeQuestionFilesFromDisk(int $id, ?array $question): void
    {
        $uploadsRoot = rtrim((string) config('services.legacy_uploads.root'), DIRECTORY_SEPARATOR);
        $dir = $uploadsRoot.DIRECTORY_SEPARATOR.'questions'.DIRECTORY_SEPARATOR.$id;
        if (File::isDirectory($dir)) {
            File::deleteDirectory($dir);
        }
        if (! is_array($question)) {
            return;
        }
        foreach (['db_file_path', 'vector_file_path'] as $field) {
            $stored = $question[$field] ?? null;
            if (! is_string($stored) || $stored === '') {
                continue;
            }
            $abs = $this->resolveUploadPath($uploadsRoot, $stored);
            if ($abs && File::isFile($abs)) {
                File::delete($abs);
            }
        }
    }

    private function resolveUploadPath(string $uploadsRoot, string $stored): ?string
    {
        $raw = str_replace('\\', '/', trim($stored));
        if ($raw === '') {
            return null;
        }
        if (str_starts_with($raw, '/uploads/') || str_starts_with($raw, 'uploads/')) {
            $rel = ltrim(str_replace('uploads/', '', ltrim($raw, '/')), '/');

            return $uploadsRoot.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $rel);
        }
        if (str_starts_with($raw, '/')) {
            return $raw;
        }

        return dirname($uploadsRoot).DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, ltrim($raw, '/'));
    }
}
