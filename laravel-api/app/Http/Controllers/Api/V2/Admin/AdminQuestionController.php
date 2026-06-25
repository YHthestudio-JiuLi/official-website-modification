<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Api\V2\Admin\Concerns\ForwardsLegacyNodeAdminRequests;
use App\Http\Controllers\Controller;
use App\Services\Legacy\QuestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminQuestionController extends Controller
{
    use ForwardsLegacyNodeAdminRequests;

    public function __construct(private readonly QuestionService $questions) {}

    public function index(): JsonResponse
    {
        try {
            return response()->json($this->questions->findAll());
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    public function show(int $id): JsonResponse
    {
        try {
            return response()->json($this->questions->findById($id));
        } catch (RuntimeException $e) {
            if (str_contains($e->getMessage(), 'not found')) {
                return response()->json(['error' => 'Question not found'], 404);
            }

            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function destroy(int $id): JsonResponse
    {
        try {
            $this->questions->delete($id);

            return response()->json(['success' => true]);
        } catch (RuntimeException $e) {
            if (str_contains($e->getMessage(), 'not found')) {
                return response()->json(['error' => 'Question not found'], 404);
            }

            return response()->json(['error' => $e->getMessage()], 500);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function uploadInit(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/questions/upload/init');
    }

    public function uploadChunk(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/questions/upload/chunk');
    }

    public function uploadComplete(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/questions/upload/complete');
    }

    public function store(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, '/api/admin/questions');
    }

    public function update(Request $request, int $id): JsonResponse|\Illuminate\Http\Response
    {
        return $this->forwardLegacyNodeAdmin($request, "/api/admin/questions/{$id}");
    }
}
