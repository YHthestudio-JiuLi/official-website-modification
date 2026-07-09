<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Agent;
use App\Models\User;
use App\Services\Agent\AgentDataScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AgentController extends Controller
{
    public function __construct(private readonly AgentDataScope $agentScope) {}

    public function index(Request $request): JsonResponse
    {
        $query = Agent::query()->with(['user', 'parent.user'])->orderByDesc('id');

        // 代理只能看自己及下级（数据隔离）
        $current = $request->user();
        if ($current->hasRole('agent') && ! $current->isSuperAdmin()) {
            $ownAgent = $current->agent;
            if (! $ownAgent) {
                return response()->json(['data' => []]);
            }
            $allowedUserIds = $ownAgent->descendantUserIds();
            $query->whereIn('user_id', $allowedUserIds);
        }

        $agents = $query->paginate(min(100, (int) $request->input('per_page', 20)));

        return response()->json([
            'data' => collect($agents->items())->map(function (Agent $agent) {
                $gross = 0.0;
                if ($agent->user) {
                    $gross = $this->agentScope->sumPaidRevenue($agent->user);
                }
                $rate = (float) $agent->commission_rate;

                return [
                    'id' => $agent->id,
                    // 历史脏数据可能存在孤儿代理记录（user 已被删除），这里必须兜底避免整页 500
                    'user' => $agent->user ? new UserResource($agent->user) : null,
                    'parent_id' => $agent->parent_id,
                    'parent_username' => $agent->parent?->user?->username,
                    'commission_rate' => $agent->commission_rate,
                    'gross_revenue' => round($gross, 2),
                    'revenue' => $this->agentScope->netRevenueAfterCommission($gross, $rate),
                    'region' => $agent->region,
                    'status' => $agent->status,
                ];
            }),
            'meta' => [
                'current_page' => $agents->currentPage(),
                'last_page' => $agents->lastPage(),
                'total' => $agents->total(),
            ],
        ]);
    }

    /** 可开通代理的已注册用户（从 users 表读取，供开通代理表单选择） */
    public function eligibleUsers(Request $request): JsonResponse
    {
        $query = User::query()
            ->eligibleForAgent()
            ->orderByDesc('id');

        if ($search = $request->string('q')->trim()->toString()) {
            $query->where(function ($q) use ($search) {
                $q->where('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->limit(50)->get(['id', 'username', 'email', 'user_type', 'status']);

        return response()->json($users->map(fn (User $user) => [
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'user_type' => $user->user_type ?? 'customer',
            'status' => $user->status ?? 'active',
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'parent_id' => ['nullable', 'integer', 'exists:agents,id'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'region' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var User $user */
        $user = User::query()->with('agent')->findOrFail($data['user_id']);

        if ($user->isSuperAdmin()) {
            return response()->json(['message' => 'Cannot assign agent to super admin'], 422);
        }

        if ($user->agent) {
            return response()->json(['message' => 'User is already an agent'], 422);
        }

        /** @var User $current */
        $current = $request->user();
        $parentId = $data['parent_id'] ?? null;

        // 代理开通下级：自动挂到当前代理名下
        if ($current->hasRole('agent') && ! $current->isSuperAdmin()) {
            $ownAgent = $current->agent;
            if (! $ownAgent) {
                return response()->json(['message' => 'Agent profile not found'], 403);
            }
            $parentId = $ownAgent->id;
        }

        $agent = DB::transaction(function () use ($data, $user, $parentId) {
            $user->user_type = 'agent';
            $user->status = 'active';
            $user->isAdmin = 0;
            $user->save();

            if (! $user->hasRole('agent')) {
                $user->assignRole('agent');
            }

            return Agent::query()->create([
                'user_id' => $user->id,
                'parent_id' => $parentId,
                'commission_rate' => $data['commission_rate'] ?? 0,
                'region' => $data['region'] ?? null,
                'status' => 'active',
            ]);
        });

        return response()->json([
            'id' => $agent->id,
            'user' => new UserResource($agent->user()->with('roles')->first()),
        ], 201);
    }

    public function update(Request $request, Agent $agent): JsonResponse
    {
        $this->assertAgentInScope($request->user(), $agent, allowSelf: false);

        $data = $request->validate([
            'commission_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'region' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'in:active,suspended'],
            'parent_id' => ['nullable', 'integer', 'exists:agents,id'],
        ]);

        $agent->fill($data);
        $agent->save();

        if (isset($data['status'])) {
            if ($data['status'] === 'suspended') {
                $agent->user?->update(['status' => 'suspended']);
            } elseif ($data['status'] === 'active') {
                $agent->user?->update(['status' => 'active']);
            }
        }

        return response()->json(['message' => 'Updated']);
    }

    /** 仅超级管理员可删除代理账户 */
    public function destroy(Request $request, Agent $agent): JsonResponse
    {
        $current = $request->user();
        if (! $current?->isSuperAdmin()) {
            abort(403, 'Only super admin can delete agents');
        }

        if ($agent->children()->exists()) {
            return response()->json(['message' => 'Cannot delete agent with subordinates'], 422);
        }

        DB::transaction(function () use ($agent) {
            /** @var User|null $user */
            $user = $agent->user;
            $agent->delete();

            if ($user) {
                $user->user_type = 'customer';
                $user->save();
                if ($user->hasRole('agent')) {
                    $user->removeRole('agent');
                }
            }
        });

        return response()->json(['message' => 'Deleted']);
    }

    /** 代理账号数据范围校验（超管不受限） */
    private function assertAgentInScope(?User $current, Agent $agent, bool $allowSelf = true): void
    {
        if (! $current || $current->isSuperAdmin() || ! $current->hasRole('agent')) {
            return;
        }

        $ownAgent = $current->agent;
        if (! $ownAgent) {
            abort(403, 'Agent profile not found');
        }

        if (! $allowSelf && (int) $agent->user_id === (int) $current->id) {
            abort(403, 'Cannot modify your own agent profile here');
        }

        $allowedUserIds = $ownAgent->descendantUserIds();
        if (! in_array((int) $agent->user_id, $allowedUserIds, true)) {
            abort(403, 'Agent out of scope');
        }
    }
}
