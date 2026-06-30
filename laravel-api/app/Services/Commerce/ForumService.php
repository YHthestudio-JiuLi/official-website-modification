<?php

namespace App\Services\Commerce;

use App\Services\Commerce\Exceptions\ReplyForbiddenException;
use App\Services\Commerce\Exceptions\ReplyNotFoundException;
use App\Models\ForumPost;
use App\Models\ForumReply;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ForumService
{
    public function listPosts(): array
    {
        return ForumPost::query()
            ->orderByDesc('isPinned')
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($p) => $p->toArray())
            ->all();
    }

    public function getPost(int $id): ?array
    {
        $post = ForumPost::query()->find($id);

        return $post ? $post->toArray() : null;
    }

    public function getReply(int $replyId): ?array
    {
        $reply = ForumReply::query()->find($replyId);

        return $reply ? $reply->toArray() : null;
    }

    public function createPost(string $author, array $data): int
    {
        $post = ForumPost::query()->create([
            'title' => trim($data['title']),
            'author' => $author,
            'content' => trim($data['content']),
            'date' => $data['date'] ?? now()->toDateString(),
            'replies' => 0,
            'isPinned' => false,
        ]);

        return (int) $post->id;
    }

    public function listReplies(int $postId): array
    {
        return ForumReply::query()
            ->where('postId', $postId)
            ->orderBy('createdAt')
            ->get()
            ->map(fn ($r) => $r->toArray())
            ->all();
    }

    public function createReply(int $postId, string $author, array $data): int
    {
        if (! ForumPost::query()->where('id', $postId)->exists()) {
            throw ValidationException::withMessages(['post' => ['Post not found']]);
        }

        return DB::transaction(function () use ($postId, $author, $data) {
            $reply = ForumReply::query()->create([
                'postId' => $postId,
                'author' => $author,
                'content' => trim($data['content']),
                'parentReplyId' => $data['parentReplyId'] ?? null,
                'createdAt' => now(),
            ]);
            ForumPost::query()->where('id', $postId)->increment('replies');

            return (int) $reply->id;
        });
    }

    public function deleteReply(int $replyId, string $author, bool $isAdmin = false): void
    {
        $reply = ForumReply::query()->find($replyId);
        if (! $reply) {
            throw new ReplyNotFoundException();
        }
        if (! $isAdmin && ! $this->isSameAuthor((string) $reply->author, $author)) {
            throw new ReplyForbiddenException();
        }

        DB::transaction(function () use ($reply) {
            $postId = $reply->postId;
            $reply->delete();
            $count = ForumReply::query()->where('postId', $postId)->count();
            ForumPost::query()->where('id', $postId)->update(['replies' => $count]);
        });
    }

    public function adminList(): array
    {
        return $this->listPosts();
    }

    public function adminGet(int $id): ?array
    {
        return $this->getPost($id);
    }

    public function adminCreate(array $data): void
    {
        ForumPost::query()->create([
            'title' => $data['title'],
            'author' => $data['author'] ?? 'admin',
            'content' => $data['content'],
            'date' => $data['date'] ?? now()->toDateString(),
            'replies' => 0,
            'isPinned' => ! empty($data['isPinned']),
        ]);
    }

    public function adminUpdate(int $id, array $data): void
    {
        $post = ForumPost::query()->findOrFail($id);
        $post->update([
            'title' => $data['title'] ?? $post->title,
            'author' => $data['author'] ?? $post->author,
            'content' => $data['content'] ?? $post->content,
            'date' => $data['date'] ?? $post->date,
            'replies' => $data['replies'] ?? $post->replies,
        ]);
    }

    public function adminTogglePin(int $id): void
    {
        $post = ForumPost::query()->findOrFail($id);
        $post->update(['isPinned' => ! $post->isPinned]);
    }

    public function adminDeletePost(int $id): void
    {
        ForumReply::query()->where('postId', $id)->delete();
        ForumPost::query()->where('id', $id)->delete();
    }

    public function adminDeleteReply(int $id): void
    {
        $this->deleteReply($id, '', true);
    }

    private function isSameAuthor(string $left, string $right): bool
    {
        return $this->normalizeAuthor($left) === $this->normalizeAuthor($right);
    }

    private function normalizeAuthor(string $author): string
    {
        return strtolower(trim($author));
    }
}
