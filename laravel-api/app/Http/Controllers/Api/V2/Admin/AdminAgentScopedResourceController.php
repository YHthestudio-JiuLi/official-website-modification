<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Services\Agent\AgentDataScope;
use App\Services\Agent\CreatorAttributionEnricher;

/** 管理端代理数据范围控制器基类：统一注入 agentScope / creatorAttribution */
abstract class AdminAgentScopedResourceController extends Controller
{
    public function __construct(
        protected readonly AgentDataScope $agentScope,
        protected readonly CreatorAttributionEnricher $creatorAttribution,
    ) {}
}
