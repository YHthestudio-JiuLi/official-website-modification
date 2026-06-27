<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Services\Bridge\NodeTelegramNotifier;
use App\Services\Commerce\ForumService;
use App\Support\PublicApiCache;
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
        $data = PublicApiCache::remember('forum', 'posts', fn () => $this->forum->listPosts());

        return response()
            ->json($data)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }

    public function show(int $id): JsonResponse
    {
        $post = PublicApiCache::remember('forum', 'post:'.$id, fn () => $this->forum->getPost($id));
        if (! $post) {
            return response()->json(['error' => 'Post not found'], 404);
        }

        return response()
            ->json($post)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:500'],
            'content' => ['required', 'string'],
        ]);
        $id = $this->forum->createPost($request->user()->username, $data);
        PublicApiCache::bump('forum');
        $post = $this->forum->getPost($id);
        if ($post) {
            $this->telegram->notifyForumPost($post);
        }

        return response()->json(['id' => $id, 'success' => true]);
    }

    public function replies(int $id): JsonResponse
    {
        $data = PublicApiCache::remember('forum', 'replies:'.$id, fn () => $this->forum->listReplies($id));

        return response()
            ->json($data)
            ->header('Cache-Control', 'public, max-age='.PublicApiCache::TTL_SECONDS);
    }

    public function storeReply(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'content' => ['required', 'string'],
            'parentReplyId' => ['nullable', 'integer'],
        ]);
        $replyId = $this->forum->createReply($id, $request->user()->username, $data);
        PublicApiCache::bump('forum');
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
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }
}
