<?php

namespace App\Services\Commerce\Exceptions;

use RuntimeException;

class ReplyForbiddenException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Forbidden');
    }
}
