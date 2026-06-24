<?php

namespace App\Http\Middleware;

use Illuminate\Cookie\Middleware\EncryptCookies as Middleware;

/**
 * XSRF-TOKEN 须明文供前端 axios 读取并回传 X-XSRF-TOKEN
 */
class EncryptCookies extends Middleware
{
    /** @var array<int, string> */
    protected $except = [
        'XSRF-TOKEN',
    ];
}
