<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

class PublicReadResponse
{
    public static function jsonNoStore(mixed $payload): JsonResponse
    {
        return response()
            ->json($payload)
            ->header('Cache-Control', 'private, no-store, max-age=0');
    }
}
