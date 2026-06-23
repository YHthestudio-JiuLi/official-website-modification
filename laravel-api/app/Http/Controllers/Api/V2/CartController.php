<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Commerce\CartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class CartController extends Controller
{
    public function __construct(private readonly CartService $cart) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->cart->getCart($request->user()->id));
    }

    public function addItem(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1'],
        ]);
        $this->cart->addItem($request->user()->id, (int) $data['productId'], (int) ($data['quantity'] ?? 1));

        return response()->json(['success' => true]);
    }

    public function updateItem(Request $request, int $productId): JsonResponse
    {
        $data = $request->validate(['quantity' => ['required', 'integer', 'min:0']]);
        $this->cart->updateQuantity($request->user()->id, $productId, (int) $data['quantity']);

        return response()->json(['success' => true]);
    }

    public function removeItem(Request $request, int $productId): JsonResponse
    {
        $this->cart->removeItem($request->user()->id, $productId);

        return response()->json(['success' => true]);
    }

    public function clear(Request $request): JsonResponse
    {
        $this->cart->clear($request->user()->id);

        return response()->json(['success' => true]);
    }
}
