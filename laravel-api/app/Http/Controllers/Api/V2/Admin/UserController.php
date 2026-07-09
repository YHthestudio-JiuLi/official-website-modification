<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    private const AGENT_ROLE_LOCK_MESSAGE = 'Agent role can only be managed in Agent Accounts';

    public function index(Request $request): JsonResponse
    {
        $query = User::query()->with(['roles', 'agent'])->orderByDesc('id');

        if ($search = $request->string('q')->trim()->toString()) {
            $query->where(function ($q) use ($search) {
                $q->where('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        // 开通代理：仅返回尚未成为代理的普通注册用户
        if ($request->boolean('eligible_for_agent')) {
            $query->eligibleForAgent();
        }

        $users = $query->get();

        // 与旧 /api/admin/users 一致：直接返回用户数组，非分页包装
        return response()->json(UserResource::collection($users)->resolve());
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(new UserResource($user->load(['roles', 'agent'])));
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureAgentRoleNotManagedHere($request);

        $data = $request->validate([
            'username' => ['required', 'string', 'max:255', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
            'isAdmin' => ['sometimes', 'boolean'],
            'user_type' => ['nullable', 'in:customer,staff,agent,super_admin'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string', Rule::exists('roles', 'name')->where('guard_name', 'web')],
        ]);

        $roles = $this->resolveRolesFromRequest($request, $data);
        $userType = $this->resolveUserType($roles, $data['user_type'] ?? null);

        $user = User::query()->create([
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'user_type' => $userType,
            'status' => 'active',
            'isAdmin' => $userType === 'super_admin' ? 1 : 0,
            'createdAt' => now(),
        ]);

        $user->syncRoles($roles);

        return response()->json(new UserResource($user->load(['roles', 'agent'])), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->ensureAgentRoleNotManagedHere($request, $user);

        $data = $request->validate([
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'isAdmin' => ['sometimes', 'boolean'],
            'user_type' => ['sometimes', 'in:customer,staff,agent,super_admin'],
            'status' => ['sometimes', 'in:active,suspended'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string', Rule::exists('roles', 'name')->where('guard_name', 'web')],
        ]);

        if ($request->user()?->id === $user->id && $request->has('isAdmin') && ! $request->boolean('isAdmin')) {
            return response()->json(['message' => 'Cannot remove your own admin role'], 422);
        }

        if (isset($data['email'])) {
            $user->email = $data['email'];
        }
        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }
        if (isset($data['status'])) {
            $user->status = $data['status'];
        }

        $roles = null;
        if ($request->has('roles') || $request->has('isAdmin')) {
            $roles = $this->resolveRolesFromRequest($request, $data, $user);
            $userType = $this->resolveUserType($roles, $data['user_type'] ?? $user->user_type);
            $user->user_type = $userType;
            $user->isAdmin = $userType === 'super_admin' ? 1 : 0;
            $user->syncRoles($roles);
        } elseif (isset($data['user_type'])) {
            $user->user_type = $data['user_type'];
            $user->isAdmin = $data['user_type'] === 'super_admin' ? 1 : 0;
        }

        $user->save();

        return response()->json(new UserResource($user->load(['roles', 'agent'])));
    }

    /** @param  array<string, mixed>  $data */
    private function resolveRolesFromRequest(Request $request, array $data, ?User $existing = null): array
    {
        if (array_key_exists('roles', $data)) {
            $roles = array_values(array_unique(array_filter($data['roles'] ?? [])));

            return $roles !== [] ? $roles : ['customer'];
        }

        if ($request->has('isAdmin')) {
            if ($request->boolean('isAdmin')) {
                return ['super_admin'];
            }
            $current = $existing?->roles->pluck('name')->all() ?? [];

            return array_values(array_filter($current, fn (string $name) => $name !== 'super_admin')) ?: ['customer'];
        }

        return $existing?->roles->pluck('name')->all() ?? ['customer'];
    }

    private function ensureAgentRoleNotManagedHere(Request $request, ?User $existing = null): void
    {
        $incomingRoles = null;
        if ($request->has('roles')) {
            $incomingRoles = array_values(array_unique(array_filter((array) $request->input('roles', []))));
        }
        $incomingHasAgentRole = is_array($incomingRoles) && in_array('agent', $incomingRoles, true);
        $incomingAgentUserType = $request->input('user_type') === 'agent';

        $existingHasAgentIdentity = $existing
            && ($existing->hasRole('agent')
                || $existing->agent()->exists()
                || $existing->user_type === 'agent');

        if ($incomingHasAgentRole || $incomingAgentUserType) {
            throw ValidationException::withMessages([
                'roles' => [self::AGENT_ROLE_LOCK_MESSAGE],
            ]);
        }

        if ($existingHasAgentIdentity && ($request->has('roles') || $request->has('user_type'))) {
            throw ValidationException::withMessages([
                'roles' => [self::AGENT_ROLE_LOCK_MESSAGE],
            ]);
        }
    }

    /** @param  array<int, string>  $roles */
    private function resolveUserType(array $roles, ?string $preferred = null): string
    {
        if ($preferred && in_array($preferred, ['customer', 'staff', 'agent', 'super_admin'], true)) {
            return $preferred;
        }
        if (in_array('super_admin', $roles, true)) {
            return 'super_admin';
        }
        if (in_array('agent', $roles, true)) {
            return 'agent';
        }
        if (in_array('staff', $roles, true)) {
            return 'staff';
        }

        return 'customer';
    }

    public function destroy(User $user): JsonResponse
    {
        if ($user->isSuperAdmin() && User::role('super_admin')->count() <= 1) {
            return response()->json(['message' => 'Cannot delete the last super admin'], 422);
        }

        $user->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
