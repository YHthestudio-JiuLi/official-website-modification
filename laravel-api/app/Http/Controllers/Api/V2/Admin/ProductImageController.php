<?php

namespace App\Http\Controllers\Api\V2\Admin;

use App\Http\Controllers\Controller;
use App\Models\StoredImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImageController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        $file = $request->file('image');
        $binary = file_get_contents($file->getRealPath());
        $image = StoredImage::query()->create([
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getMimeType() ?: 'application/octet-stream',
            'data' => $binary,
            'size' => strlen($binary),
        ]);

        return response()->json([
            'ok' => true,
            'image' => '/api/v2/product-images/'.$image->id,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $imagePath = (string) $request->input('image', '');
        if (preg_match('#^/api/v2/product-images/(\d+)$#', $imagePath, $m)) {
            StoredImage::query()->where('id', (int) $m[1])->delete();
        } elseif (preg_match('#^/api/product-images/(\d+)$#', $imagePath, $m)) {
            StoredImage::query()->where('id', (int) $m[1])->delete();
        }

        return response()->json(['ok' => true]);
    }
}
