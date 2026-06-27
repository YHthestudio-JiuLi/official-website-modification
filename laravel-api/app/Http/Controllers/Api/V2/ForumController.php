<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Bridge\NodeTelegramNotifier;
use App\Services\Commerce\ForumService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ForumController extends Controller
{
    public function __construct(
        private readonly ForumService $forum,
        private readonly NodeTelegramNotifier $telegram,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json($this->forum->listPosts());
    }

    public function show(int $id): JsonResponse
    {
        $post = $this->forum->getPost($id);
        if (! $post) {
            return response()->json(['error' => 'Post not found'], 404);
        }

        return response()->json($post);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:500'],
            'content' => ['required', 'string'],
        ]);
        $id = $this->forum->createPost($request->user()->username, $data);
        $post = $this->forum->getPost($id);
        if ($post) {
            $this->telegram->notifyForumPost($post);
        }

        return response()->json(['id' => $id, 'success' => true]);
    }

    public function replies(int $id): JsonResponse
    {
        return response()->json($this->forum->listReplies($id));
    }

    public function storeReply(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'content' => ['required', 'string'],
            'parentReplyId' => ['nullable', 'integer'],
        ]);
        $replyId = $this->forum->createReply($id, $request->user()->username, $data);
        $reply = $this->forum->getReply($replyId);
        $post = $this->forum->getPost($id);
        $parentReply = null;
        if (! empty($data['parentReplyId'])) {
            $parentReply = $this->forum->getReply((int) $data['parentReplyId']);
        }
        if ($reply && $post) {
            $this->telegram->notifyForumReply($reply, $post, $parentReply);
        }

        return response()->json(['id' => $replyId, 'success' => true]);
    }

    public function destroyReply(Request $request, int $id): JsonResponse
    {
        $this->forum->deleteReply($id, $request->user()->username, false);

        return response()->json(['success' => true]);
    }
}
