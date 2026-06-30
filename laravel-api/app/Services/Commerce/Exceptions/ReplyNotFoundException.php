<?php

namespace App\Services\Commerce\Exceptions;

use RuntimeException;

class ReplyNotFoundException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Reply not found');
    }
}
