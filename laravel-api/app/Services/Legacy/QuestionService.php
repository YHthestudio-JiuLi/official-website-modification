<?php

namespace App\Services\Legacy;

use App\Services\Database\PyDbClient;
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

    public function delete(int $id): void
    {
        $this->db->call('questions.delete', ['id' => $id]);
    }
}
