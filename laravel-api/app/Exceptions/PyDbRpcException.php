<?php

namespace App\Exceptions;

use RuntimeException;

/** Python RPC 业务错误（携带结构化 code / http_status） */
class PyDbRpcException extends RuntimeException
{
    public function __construct(
        public readonly string $rpcCode,
        string $message,
        public readonly int $httpStatus = 400,
    ) {
        parent::__construct($message);
    }
}
