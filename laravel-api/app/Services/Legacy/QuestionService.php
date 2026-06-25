<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class QuestionService
{
    public function __construct(private readonly PyDbClient $db) {}

    public function findAll(): array
    {
        return $this->db->call('questions.findAll') ?? [];
    }

    public function findById(int $id): array
    {
        $question = $this->db->call('questions.findById', ['id' => $id]);
        if (! $question) {
            throw new RuntimeException('Question not found');
        }

        return $question;
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
            throw new RuntimeException('Question not found');
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
