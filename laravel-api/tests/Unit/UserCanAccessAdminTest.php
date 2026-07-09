<?php

namespace Tests\Unit;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class UserCanAccessAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::query()->firstOrCreate(['name' => 'customer', 'guard_name' => 'web']);
        Role::query()->firstOrCreate(['name' => 'agent', 'guard_name' => 'web']);
        Role::query()->firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
    }

    public function test_customer_cannot_access_admin_even_with_legacy_is_admin_flag(): void
    {
        $user = User::query()->create([
            'username' => 'cust_only',
            'email' => 'cust_only@example.com',
            'password' => bcrypt('secret'),
            'isAdmin' => 1,
            'user_type' => 'customer',
            'status' => 'active',
        ]);
        $user->assignRole('customer');

        $this->assertFalse($user->canAccessAdmin());
    }

    public function test_agent_with_admin_access_can_access_admin(): void
    {
        $this->seed(\Database\Seeders\RolePermissionSeeder::class);

        $user = User::query()->create([
            'username' => 'agent_user',
            'email' => 'agent_user@example.com',
            'password' => bcrypt('secret'),
            'isAdmin' => 0,
            'user_type' => 'agent',
            'status' => 'active',
        ]);
        $user->assignRole('agent');

        $this->assertTrue($user->canAccessAdmin());
    }
}
