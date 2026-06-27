<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Models\StoredImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as BaseResponse;

class ProductImageController extends Controller
{
    public function show(int $id): BaseResponse
    {
        $img = StoredImage::query()
            ->select(['id', 'mime', 'data'])
            ->find($id);
        if (! $img || empty($img->data)) {
            return response()->json(['error' => 'Image not found'], 404);
        }

        return response($img->data, 200, [
            'Content-Type' => $img->mime ?: 'application/octet-stream',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
