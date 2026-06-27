<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\ForumService;
use App\Support\PublicApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminForumController extends Controller
{
    public function __construct(private readonly ForumService $forum) {}

    public function index(): JsonResponse
    {
        return response()->json($this->forum->adminList());
    }

    public function show(int $id): JsonResponse
    {
        $post = $this->forum->adminGet($id);
        if (! $post) {
            return response()->json(['error' => 'Not found'], 404);
        }

        return response()->json($post);
    }

    public function store(Request $request): JsonResponse
    {
        $this->forum->adminCreate($request->all());
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->forum->adminUpdate($id, $request->all());
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }

    public function pin(int $id): JsonResponse
    {
        $this->forum->adminTogglePin($id);
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->forum->adminDeletePost($id);
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }

    public function replies(int $id): JsonResponse
    {
        // 与旧 Node API 一致：{ replies: [...] }
        return response()->json([
            'replies' => $this->forum->listReplies($id),
        ]);
    }

    public function destroyReply(int $id): JsonResponse
    {
        $this->forum->adminDeleteReply($id);
        PublicApiCache::bump('forum');

        return response()->json(['success' => true]);
    }
}
