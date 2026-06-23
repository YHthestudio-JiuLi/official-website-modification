<?php

return [

    // 管理端 IP 白名单（逗号分隔，留空则不限制）
    'admin_ip_whitelist' => array_filter(array_map('trim', explode(',', env('ADMIN_IP_WHITELIST', '')))),

    // 登录失败多少次后临时锁定（配合限流）
    'max_login_attempts' => (int) env('MAX_LOGIN_ATTEMPTS', 5),

];
