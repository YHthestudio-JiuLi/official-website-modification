<?php

namespace App\Http\Controllers\Api\V2\Admin\Concerns;

use App\Services\Legacy\FirmwareService;
use App\Services\Legacy\QuestionService;

/** 设备绑定题库/固件时，控制器须提供目录服务 */
interface ProvidesAgentLinkedCatalogServices
{
    public function questionService(): QuestionService;

    public function firmwareService(): FirmwareService;
}
