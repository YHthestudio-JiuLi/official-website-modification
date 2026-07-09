<?php

namespace App\Http\Controllers\Api\V2\Admin\Concerns;

use App\Exceptions\ResourceNotFoundException;
use App\Services\Agent\AgentDataScope;
use Illuminate\Http\Request;
use RuntimeException;

/** 设备绑定题库/固件时校验代理对关联资源的归属（需实现 ProvidesAgentLinkedCatalogServices） */
trait AssertsAgentOwnedResources
{
    protected function assertAgentOwnsLinkedResources(Request $request, ?int $questionId, ?int $firmwareId): void
    {
        if (! $this instanceof ProvidesAgentLinkedCatalogServices) {
            throw new RuntimeException('AssertsAgentOwnedResources requires ProvidesAgentLinkedCatalogServices');
        }

        /** @var AgentDataScope $scope */
        $scope = $this->agentScope;
        if (! $scope->isScopedAgent($request->user())) {
            return;
        }

        if ($questionId !== null && $questionId > 0) {
            try {
                $question = $this->questionService()->findById($questionId);
            } catch (ResourceNotFoundException|RuntimeException) {
                abort(404, 'Question not found');
            }
            $scope->assertCanManageQuestion($request->user(), $question);
        }

        if ($firmwareId !== null && $firmwareId > 0) {
            try {
                $row = $this->firmwareService()->findById($firmwareId);
                if (! $row) {
                    abort(404, 'Firmware not found');
                }
            } catch (RuntimeException) {
                abort(404, 'Firmware not found');
            }
            $scope->assertCanManageFirmware($request->user(), $row);
        }
    }
}
