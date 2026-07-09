<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\Agent\AgentDataScope;
use App\Services\Database\PyDbClient;
use Mockery;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AgentDataScopeTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function makeScope(?bool $rpcScopedAgent = null): AgentDataScope
    {
        $db = Mockery::mock(PyDbClient::class);
        if ($rpcScopedAgent !== null) {
            $db->shouldReceive('call')
                ->with('users.isScopedAgent', Mockery::type('array'))
                ->andReturn($rpcScopedAgent);
        }

        return new AgentDataScope($db);
    }

    public function test_is_scoped_agent_delegates_to_python_rpc(): void
    {
        $user = Mockery::mock(User::class);
        $user->id = 12;

        $scope = $this->makeScope(true);
        $this->assertTrue($scope->isScopedAgent($user));
    }

    public function test_assert_created_by_allows_non_scoped_admin(): void
    {
        $scope = $this->makeScope(false);
        $user = Mockery::mock(User::class);
        $user->id = 1;

        $scope->assertCreatedBy($user, ['created_by_user_id' => 99], 'Not found');
        $this->assertTrue(true);
    }

    public function test_assert_created_by_aborts_when_agent_owns_different_row(): void
    {
        $scope = $this->makeScope(true);
        $user = Mockery::mock(User::class);
        $user->id = 12;

        $this->expectException(HttpException::class);
        $scope->assertCreatedBy($user, ['created_by_user_id' => 99], 'Firmware not found');
    }

    public function test_assert_created_by_allows_agent_own_row(): void
    {
        $scope = $this->makeScope(true);
        $user = Mockery::mock(User::class);
        $user->id = 12;

        $scope->assertCreatedBy($user, ['created_by_user_id' => 12], 'Firmware not found');
        $this->assertTrue(true);
    }
}
