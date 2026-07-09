<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\V2\Admin\AdminFirmwareController;
use App\Models\User;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;
use App\Services\Legacy\FirmwareService;
use Illuminate\Http\Request;
use Mockery;
use PHPUnit\Framework\TestCase;

class AdminFirmwareAgentScopeTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_register_local_denies_scoped_agent(): void
    {
        $firmware = Mockery::mock(FirmwareService::class);
        $agentScope = Mockery::mock(AgentDataScope::class);
        $creatorAttribution = Mockery::mock(CreatorAttributionEnricher::class);

        $user = Mockery::mock(User::class);
        $user->id = 12;

        $agentScope->shouldReceive('isScopedAgent')->with($user)->andReturn(true);
        $firmware->shouldNotReceive('registerLocal');

        $controller = new AdminFirmwareController($firmware, $agentScope, $creatorAttribution);
        $request = Request::create('/api/v2/admin/device-firmwares/register-local', 'POST', [
            'file_name' => 'demo.bin',
        ]);
        $request->setUserResolver(fn () => $user);

        $response = $controller->registerLocal($request);

        $this->assertSame(403, $response->getStatusCode());
        $payload = $response->getData(true);
        $this->assertStringContainsString('cannot register', strtolower($payload['error'] ?? ''));
    }
}
