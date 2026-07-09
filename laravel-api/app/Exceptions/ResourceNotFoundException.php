<?php

namespace App\Exceptions;

use RuntimeException;

/** 资源不存在（含代理越权访问时统一返回 404，避免枚举 ID） */
class ResourceNotFoundException extends RuntimeException
{
}
