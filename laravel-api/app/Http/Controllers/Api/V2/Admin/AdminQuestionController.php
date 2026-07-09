<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Exceptions\ResourceNotFoundException;
use App\Http\Controllers\Api\V2\Admin\Concerns\ForwardsLegacyNodeAdminRequests;
use App\Http\Controllers\Api\V2\Admin\Concerns\ScopesAgentOwnedAdminList;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;
use App\Services\Legacy\QuestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AdminQuestionController extends AdminAgentScopedResourceController
{
    use ForwardsLegacyNodeAdminRequests;
    use ScopesAgentOwnedAdminList;

    public function __construct(
        private readonly QuestionService $questions,
        AgentDataScope $agentScope,
        CreatorAttributionEnricher $creatorAttribution,
    ) {
        parent::__construct($agentScope, $creatorAttribution);
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $ownerId = $this->scopedOwnerId($request);
            $rows = $this->questions->findAll($ownerId);

            return response()->json($this->enrichAdminListIfNeeded($rows, $ownerId));
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            $question = $this->questions->findById($id);
        } catch (ResourceNotFoundException) {
            return response()->json(['error' => 'Question not found'], 404);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        $this->agentScope->assertCanManageQuestion($request->user(), $question);

        return response()->json($question);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            $question = $this->questions->findById($id);
        } catch (ResourceNotFoundException) {
            return response()->json(['error' => 'Question not found'], 404);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        $this->agentScope->assertCanManageQuestion($request->user(), $question);

        try {
            $this->questions->delete($id);

            return response()->json(['success' => true]);
        } catch (ResourceNotFoundException) {
            return response()->json(['error' => 'Question not found'], 404);
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
        try {
            $question = $this->questions->findById($id);
        } catch (ResourceNotFoundException) {
            return response()->json(['error' => 'Question not found'], 404);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        $this->agentScope->assertCanManageQuestion($request->user(), $question);

        if ($this->agentScope->isScopedAgent($request->user())) {
            $hasFileUpload = $request->filled('dbChunkUploadId')
                || $request->filled('vectorChunkUploadId')
                || $request->hasFile('dbFile')
                || $request->hasFile('vectorFile');
            if ($hasFileUpload) {
                return $this->forwardLegacyNodeAdmin($request, "/api/admin/questions/{$id}");
            }

            $name = trim((string) $request->input('name', ''));
            if ($name === '') {
                return response()->json(['error' => 'name is required'], 400);
            }

            $categoryName = $request->filled('category_name')
                ? trim((string) $request->input('category_name'))
                : null;
            if ($categoryName === '') {
                $categoryName = null;
            }

            try {
                $this->questions->updateMetadata($id, $name, $categoryName);

                return response()->json(['success' => true]);
            } catch (\Throwable $e) {
                return response()->json(['error' => $e->getMessage()], 500);
            }
        }

        return $this->forwardLegacyNodeAdmin($request, "/api/admin/questions/{$id}");
    }
}
