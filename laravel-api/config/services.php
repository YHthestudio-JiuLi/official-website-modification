<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'sf_express' => [
        'partner_id' => env('SF_PARTNER_ID'),
        'check_word' => env('SF_CHECK_WORD'),
        'sandbox' => env('SF_SANDBOX', false),
    ],

    // Node legacy API（config:cache 后须通过 config() 读取，不可在控制器里直接 env()）
    'legacy_node' => [
        'url' => env('LEGACY_NODE_URL', 'http://127.0.0.1:3000'),
        'internal_secret' => env('NODE_INTERNAL_SECRET'),
    ],

    'py_db' => [
        'url' => env('PY_DB_URL') ?: 'http://127.0.0.1:5100',
    ],

    'legacy_uploads' => [
        'root' => env('LEGACY_UPLOADS_ROOT') ?: dirname(base_path()).'/uploads',
    ],

];
