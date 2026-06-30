<?php

namespace App\Http\Controllers\Api\V2\Internal;

use App\Http\Controllers\Controller;
use App\Services\Commerce\ForumService;
use Illuminate\Http\JsonResponse;

/**
 * Node/Telegram 内部回调：论坛删帖删回复（与 V2 前台同源）
 */
class InternalForumController extends Controller
{
    public function __construct(private readonly ForumService $forum) {}

    public function destroyPost(int $id): JsonResponse
    {
        if (! $this->forum->getPost($id)) {
            return response()->json(['error' => 'Post not found'], 404);
        }
        $this->forum->adminDeletePost($id);

        return response()->json(['success' => true]);
    }

    public function destroyReply(int $id): JsonResponse
    {
        $reply = $this->forum->getReply($id);
        if (! $reply) {
            return response()->json(['error' => 'Reply not found'], 404);
        }
        $this->forum->adminDeleteReply($id);

        return response()->json(['success' => true, 'postId' => $reply['postId'] ?? null]);
    }
}
