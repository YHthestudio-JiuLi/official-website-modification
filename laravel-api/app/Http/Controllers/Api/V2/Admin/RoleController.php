<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = Role::query()->with('permissions')->orderBy('name')->get();

        return response()->json($roles->map(fn (Role $role) => [
            'id' => $role->id,
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name'),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:roles,name'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $role = Role::query()->create(['name' => $data['name'], 'guard_name' => 'web']);
        if (! empty($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return response()->json([
            'id' => $role->id,
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name'),
        ], 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->name === 'super_admin') {
            return response()->json(['message' => 'Cannot modify super_admin role'], 422);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100', 'unique:roles,name,'.$role->id],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        if (isset($data['name'])) {
            $role->name = $data['name'];
            $role->save();
        }
        if (array_key_exists('permissions', $data)) {
            $role->syncPermissions($data['permissions'] ?? []);
        }

        return response()->json([
            'id' => $role->id,
            'name' => $role->name,
            'permissions' => $role->fresh('permissions')->permissions->pluck('name'),
        ]);
    }

    public function destroy(Role $role): JsonResponse
    {
        if (in_array($role->name, ['super_admin', 'staff', 'agent', 'customer'], true)) {
            return response()->json(['message' => 'Cannot delete system role'], 422);
        }

        $role->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
