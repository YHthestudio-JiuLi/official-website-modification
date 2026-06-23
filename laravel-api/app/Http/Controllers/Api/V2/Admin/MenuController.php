<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * 按权限动态返回后台菜单（前端 v-permission 配合使用）
 */
class MenuController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $permissions = $user->getAllPermissions()->pluck('name')->all();
        $isSuper = $user->isSuperAdmin();

        $menus = [
            ['key' => 'dashboard', 'path' => '/admin', 'permission' => 'admin.access', 'icon' => 'fa-chart-line'],
            ['key' => 'users', 'path' => '/admin/users', 'permission' => 'user.view', 'icon' => 'fa-users'],
            ['key' => 'roles', 'path' => '/admin/roles', 'permission' => 'role.view', 'icon' => 'fa-shield-halved'],
            ['key' => 'agents', 'path' => '/admin/agents', 'permission' => 'agent.view', 'altPermissions' => ['agent.create', 'agent.manage'], 'icon' => 'fa-user-tie'],
            ['key' => 'products', 'path' => '/admin/products', 'permission' => 'product.view', 'icon' => 'fa-box'],
            ['key' => 'orders', 'path' => '/admin/orders', 'permission' => 'order.view', 'altPermission' => 'order.view_own_tree', 'icon' => 'fa-receipt'],
            ['key' => 'questions', 'path' => '/admin/questions', 'permission' => 'question.view', 'altPermissions' => ['question.edit', 'question.delete'], 'icon' => 'fa-database'],
            ['key' => 'firmwares', 'path' => '/admin/firmwares', 'permission' => 'firmware.view', 'altPermissions' => ['firmware.edit', 'firmware.delete'], 'icon' => 'fa-microchip'],
            ['key' => 'devices', 'path' => '/admin/device-verification', 'permission' => 'device.view', 'icon' => 'fa-microchip'],
        ];

        $visible = array_values(array_filter($menus, function (array $item) use ($permissions, $isSuper) {
            if ($isSuper) {
                return true;
            }

            if (in_array($item['permission'], $permissions, true)) {
                return true;
            }

            foreach ($item['altPermissions'] ?? [] as $alt) {
                if (in_array($alt, $permissions, true)) {
                    return true;
                }
            }

            $alt = $item['altPermission'] ?? null;

            return $alt && in_array($alt, $permissions, true);
        }));

        return response()->json($visible);
    }
}
