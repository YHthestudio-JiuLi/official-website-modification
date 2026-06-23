<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    /** 权限命名：模块.动作 */
    public const PERMISSIONS = [
        'admin.access',
        'user.view', 'user.create', 'user.update', 'user.delete',
        'role.view', 'role.manage',
        'agent.view', 'agent.create', 'agent.manage',
        'product.view', 'product.manage',
        'order.view', 'order.view_own_tree', 'order.manage',
        'forum.view', 'forum.manage',
        'question.view', 'question.edit', 'question.delete',
        'firmware.view', 'firmware.edit', 'firmware.delete',
        'device.view', 'device.keys.view',
        'payment.view', 'payment.manage',
        'content.view', 'content.manage',
        'chat.manage', 'chat.settings',
    ];

    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (self::PERMISSIONS as $name) {
            Permission::query()->firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        // 迁移已废弃的 question.manage → question.edit + question.delete
        $legacyManage = Permission::query()->where('name', 'question.manage')->first();
        if ($legacyManage) {
            $editPerm = Permission::query()->where('name', 'question.edit')->first();
            $deletePerm = Permission::query()->where('name', 'question.delete')->first();
            Role::query()->each(function (Role $role) use ($legacyManage, $editPerm, $deletePerm) {
                if ($role->hasPermissionTo($legacyManage)) {
                    if ($editPerm) {
                        $role->givePermissionTo($editPerm);
                    }
                    if ($deletePerm) {
                        $role->givePermissionTo($deletePerm);
                    }
                    if (! $role->hasPermissionTo('question.view')) {
                        $role->givePermissionTo('question.view');
                    }
                }
            });
            $legacyManage->delete();
        }

        // 拆分 chat.manage：原权限同时授予聊天设置
        Role::query()->each(function (Role $role) {
            if ($role->hasPermissionTo('chat.manage') && ! $role->hasPermissionTo('chat.settings')) {
                $role->givePermissionTo('chat.settings');
            }
        });

        $all = Permission::all();

        $superAdmin = Role::query()->firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        $superAdmin->syncPermissions($all);

        $staff = Role::query()->firstOrCreate(['name' => 'staff', 'guard_name' => 'web']);
        // 仅补全缺失默认权限，不覆盖后台已自定义的权限配置
        $staff->givePermissionTo([
            'admin.access', 'user.view', 'product.view', 'product.manage',
            'order.view', 'order.manage', 'forum.view', 'forum.manage', 'chat.manage', 'chat.settings',
            'payment.view', 'payment.manage', 'content.view', 'content.manage',
            'question.view',
        ]);

        $agent = Role::query()->firstOrCreate(['name' => 'agent', 'guard_name' => 'web']);
        $agent->givePermissionTo([
            'admin.access',
            'order.view_own_tree',
            'product.view',
            'product.manage',
        ]);

        $customer = Role::query()->firstOrCreate(['name' => 'customer', 'guard_name' => 'web']);
        $customer->syncPermissions([]);

        // 将现有 isAdmin=1 用户挂上 super_admin 角色
        User::query()->where('isAdmin', 1)->each(function (User $user) {
            if (! $user->hasRole('super_admin')) {
                $user->assignRole('super_admin');
            }
            if (empty($user->user_type) || $user->user_type === 'customer') {
                $user->update(['user_type' => 'super_admin', 'status' => 'active']);
            }
        });
    }
}
