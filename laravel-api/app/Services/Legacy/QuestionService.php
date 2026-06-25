<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
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
    }
}
