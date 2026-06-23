<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Commerce\ForumService;
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

        return response()->json(['success' => true]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->forum->adminUpdate($id, $request->all());

        return response()->json(['success' => true]);
    }

    public function pin(int $id): JsonResponse
    {
        $this->forum->adminTogglePin($id);

        return response()->json(['success' => true]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->forum->adminDeletePost($id);

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

        return response()->json(['success' => true]);
    }
}
