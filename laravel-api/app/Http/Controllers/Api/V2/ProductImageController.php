<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Models\StoredImage;
use App\Support\ProductImageDiskCache;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response as BaseResponse;

class ProductImageController extends Controller
{
    public function show(int $id): BaseResponse
    {
        $cached = ProductImageDiskCache::read($id);
        if ($cached) {
            return $this->fileResponse($cached['path'], $cached['mime']);
        }

        $img = StoredImage::query()
            ->select(['id', 'mime', 'data'])
            ->find($id);
        if (! $img || empty($img->data)) {
            return response()->json(['error' => 'Image not found'], 404);
        }

        $mime = $img->mime ?: 'image/jpeg';
        ProductImageDiskCache::write($id, $img->data, $mime);

        $written = ProductImageDiskCache::read($id);
        if ($written) {
            return $this->fileResponse($written['path'], $written['mime']);
        }

        return response($img->data, 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private function fileResponse(string $path, string $mime): BinaryFileResponse
    {
        return response()->file($path, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
