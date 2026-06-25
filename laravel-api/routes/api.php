<?php

use App\Http\Controllers\Api\V2\AuthController;
use App\Http\Controllers\Api\V2\Bridge\LegacyBridgeController;
use App\Http\Controllers\Api\V2\CartController;
use App\Http\Controllers\Api\V2\ForumController;
use App\Http\Controllers\Api\V2\OrderController;
use App\Http\Controllers\Api\V2\PaymentSettingsController;
use App\Http\Controllers\Api\V2\PopupNoticeController;
use App\Http\Controllers\Api\V2\ProductCategoryController;
use App\Http\Controllers\Api\V2\ProductController;
use App\Http\Controllers\Api\V2\ProductImageController;
use App\Http\Controllers\Api\V2\Admin\AdminChatSettingsController;
use App\Http\Controllers\Api\V2\Admin\AdminDeviceVerificationController;
use App\Http\Controllers\Api\V2\Admin\AdminFirmwareController;
use App\Http\Controllers\Api\V2\Admin\AdminForumController;
use App\Http\Controllers\Api\V2\Admin\AdminOrderController;
use App\Http\Controllers\Api\V2\Admin\AdminPaymentSettingsController;
use App\Http\Controllers\Api\V2\Admin\AdminPopupNoticeController;
use App\Http\Controllers\Api\V2\Admin\AgentController;
use App\Http\Controllers\Api\V2\Admin\DashboardController;
use App\Http\Controllers\Api\V2\Admin\AdminQuestionController;
use App\Http\Controllers\Api\V2\Admin\MenuController;
use App\Http\Controllers\Api\V2\Admin\PermissionController;
use App\Http\Controllers\Api\V2\Admin\ProductCategoryController as AdminProductCategoryController;
use App\Http\Controllers\Api\V2\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V2\Admin\ProductImageController as AdminProductImageController;
use App\Http\Controllers\Api\V2\Admin\RoleController;
use App\Http\Controllers\Api\V2\Admin\UserController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    $payload = [
        'ok' => true,
        'service' => 'laravel-api',
        'version' => '2.2.0',
    ];

    try {
        DB::connection()->getPdo();
        $payload['db'] = DB::connection()->getDatabaseName();
    } catch (\Throwable $e) {
        $payload['ok'] = false;
        $payload['db_error'] = $e->getMessage();
    }

    return response()->json($payload, $payload['ok'] ? 200 : 503);
});

// ---------- 公开 API（只读，限流） ----------
Route::middleware('throttle:api')->group(function () {
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{id}', [ProductController::class, 'show'])->whereNumber('id');
    Route::get('/product-categories', [ProductCategoryController::class, 'index']);
    Route::get('/product-images/{id}', [ProductImageController::class, 'show'])->whereNumber('id');
    Route::get('/payment-settings', [PaymentSettingsController::class, 'show']);
    Route::get('/popup-notice', [PopupNoticeController::class, 'active']);

    Route::get('/forum/posts', [ForumController::class, 'index']);
    Route::get('/forum/posts/{id}', [ForumController::class, 'show'])->whereNumber('id');
    Route::get('/forum/posts/{id}/replies', [ForumController::class, 'replies'])->whereNumber('id');
});

// 认证（限流防暴力破解）
Route::middleware('throttle:login')->group(function () {
    Route::post('/auth/admin/login', [AuthController::class, 'adminLogin']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);
});

// 前台用户 API（web guard）
Route::middleware(['auth:web', 'use.guard:web', 'throttle:api'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'userLogout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // 购物车
    Route::get('/cart', [CartController::class, 'index']);
    Route::post('/cart/items', [CartController::class, 'addItem']);
    Route::put('/cart/items/{productId}', [CartController::class, 'updateItem'])->whereNumber('productId');
    Route::delete('/cart/items/{productId}', [CartController::class, 'removeItem'])->whereNumber('productId');
    Route::delete('/cart', [CartController::class, 'clear']);

    // 订单
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{id}', [OrderController::class, 'show'])->whereNumber('id');
    Route::get('/orders/{id}/tracking', [OrderController::class, 'tracking'])->whereNumber('id');
    Route::post('/orders/{id}/confirm', [OrderController::class, 'confirm'])->whereNumber('id');
    Route::put('/orders/{id}/status', [OrderController::class, 'updateStatus'])->whereNumber('id');

    // 论坛（写操作）
    Route::post('/forum/posts', [ForumController::class, 'store']);
    Route::post('/forum/posts/{id}/replies', [ForumController::class, 'storeReply'])->whereNumber('id');
    Route::delete('/forum/replies/{id}', [ForumController::class, 'destroyReply'])->whereNumber('id');
});

// 后台管理 API（admin guard，与前台 web 会话独立）
Route::middleware(['auth:admin', 'use.guard:admin', 'admin.boot', 'throttle:api'])->group(function () {
    Route::post('/auth/admin/logout', [AuthController::class, 'adminLogout']);
    Route::get('/auth/admin/me', [AuthController::class, 'adminMe']);
    Route::post('/auth/admin/legacy-node-bridge', [AuthController::class, 'legacyNodeBridgeToken']);

    Route::prefix('admin')->group(function () {
        Route::get('/menus', [MenuController::class, 'index'])
            ->middleware('permission:admin.access');

        Route::get('/stats', [DashboardController::class, 'stats'])
            ->middleware('permission:admin.access');

        Route::get('/permissions', [PermissionController::class, 'index'])
            ->middleware('permission:role.view');

        Route::get('/roles', [RoleController::class, 'index'])
            ->middleware('permission:role.view');
        Route::post('/roles', [RoleController::class, 'store'])
            ->middleware('permission:role.manage');
        Route::put('/roles/{role}', [RoleController::class, 'update'])
            ->middleware('permission:role.manage');
        Route::delete('/roles/{role}', [RoleController::class, 'destroy'])
            ->middleware('permission:role.manage');

        Route::get('/users', [UserController::class, 'index'])
            ->middleware('permission:user.view');
        Route::get('/users/{user}', [UserController::class, 'show'])
            ->middleware('permission:user.view');
        Route::post('/users', [UserController::class, 'store'])
            ->middleware('permission:user.create');
        Route::put('/users/{user}', [UserController::class, 'update'])
            ->middleware('permission:user.update');
        Route::delete('/users/{user}', [UserController::class, 'destroy'])
            ->middleware('permission:user.delete');

        Route::get('/agents', [AgentController::class, 'index'])
            ->middleware('role_or_permission:agent.view|agent.create|agent.manage');
        Route::get('/agents/eligible-users', [AgentController::class, 'eligibleUsers'])
            ->middleware('permission:agent.create');
        Route::post('/agents', [AgentController::class, 'store'])
            ->middleware('permission:agent.create');
        Route::put('/agents/{agent}', [AgentController::class, 'update'])
            ->middleware('permission:agent.manage');
        Route::delete('/agents/{agent}', [AgentController::class, 'destroy'])
            ->middleware('permission:agent.manage');

        // 商品与分类
        Route::get('/products', [AdminProductController::class, 'index'])
            ->middleware('permission:product.view');
        Route::get('/products/{product}', [AdminProductController::class, 'show'])
            ->middleware('permission:product.view');
        Route::post('/products', [AdminProductController::class, 'store'])
            ->middleware('permission:product.manage');
        Route::put('/products/{product}', [AdminProductController::class, 'update'])
            ->middleware('permission:product.manage');
        Route::delete('/products/{product}', [AdminProductController::class, 'destroy'])
            ->middleware('permission:product.manage');

        Route::post('/upload/product-image', [AdminProductImageController::class, 'store'])
            ->middleware('permission:product.manage');
        Route::delete('/upload/product-image', [AdminProductImageController::class, 'destroy'])
            ->middleware('permission:product.manage');

        Route::get('/product-categories', [AdminProductCategoryController::class, 'index'])
            ->middleware('permission:product.view');
        Route::post('/product-categories', [AdminProductCategoryController::class, 'store'])
            ->middleware('permission:product.manage');
        Route::put('/product-categories/{category}', [AdminProductCategoryController::class, 'update'])
            ->middleware('permission:product.manage');
        Route::delete('/product-categories/{category}', [AdminProductCategoryController::class, 'destroy'])
            ->middleware('permission:product.manage');

        // 订单
        Route::get('/orders', [AdminOrderController::class, 'index'])
            ->middleware('role_or_permission:order.view|order.view_own_tree');
        Route::put('/orders/{id}/status', [AdminOrderController::class, 'updateStatus'])
            ->middleware('permission:order.manage');
        Route::put('/orders/{id}/tracking', [AdminOrderController::class, 'updateTracking'])
            ->middleware('permission:order.manage');
        Route::delete('/orders/{id}', [AdminOrderController::class, 'destroy'])
            ->middleware('permission:order.manage');

        // 论坛
        Route::get('/posts', [AdminForumController::class, 'index'])
            ->middleware('permission:forum.view');
        Route::get('/posts/{id}', [AdminForumController::class, 'show'])
            ->middleware('permission:forum.view');
        Route::post('/posts', [AdminForumController::class, 'store'])
            ->middleware('permission:forum.manage');
        Route::put('/posts/{id}', [AdminForumController::class, 'update'])
            ->middleware('permission:forum.manage');
        Route::post('/posts/{id}/pin', [AdminForumController::class, 'pin'])
            ->middleware('permission:forum.manage');
        Route::delete('/posts/{id}', [AdminForumController::class, 'destroy'])
            ->middleware('permission:forum.manage');
        Route::get('/posts/{id}/replies', [AdminForumController::class, 'replies'])
            ->middleware('permission:forum.view');
        Route::delete('/replies/{id}', [AdminForumController::class, 'destroyReply'])
            ->middleware('permission:forum.manage');

        // 支付设置
        Route::get('/payment-settings', [AdminPaymentSettingsController::class, 'show'])
            ->middleware('permission:payment.view');
        Route::put('/payment-settings', [AdminPaymentSettingsController::class, 'update'])
            ->middleware('permission:payment.manage');

        // 弹窗公告
        Route::get('/popup-notices', [AdminPopupNoticeController::class, 'index'])
            ->middleware('permission:content.view');
        Route::post('/popup-notices', [AdminPopupNoticeController::class, 'store'])
            ->middleware('permission:content.manage');
        Route::put('/popup-notices/{id}', [AdminPopupNoticeController::class, 'update'])
            ->middleware('permission:content.manage');
        Route::delete('/popup-notices/{id}', [AdminPopupNoticeController::class, 'destroy'])
            ->middleware('permission:content.manage');

        // 题库（V2 原生 + 分片上传经 Node 代发）
        Route::get('/questions', [AdminQuestionController::class, 'index'])
            ->middleware('role_or_permission:question.view|question.edit|question.delete');
        Route::get('/questions/{id}', [AdminQuestionController::class, 'show'])
            ->whereNumber('id')
            ->middleware('role_or_permission:question.view|question.edit|question.delete');
        Route::post('/questions', [AdminQuestionController::class, 'store'])
            ->middleware('permission:question.edit');
        Route::put('/questions/{id}', [AdminQuestionController::class, 'update'])
            ->whereNumber('id')
            ->middleware('permission:question.edit');
        Route::delete('/questions/{id}', [AdminQuestionController::class, 'destroy'])
            ->whereNumber('id')
            ->middleware('permission:question.delete');
        Route::post('/questions/upload/init', [AdminQuestionController::class, 'uploadInit'])
            ->middleware('permission:question.edit');
        Route::post('/questions/upload/chunk', [AdminQuestionController::class, 'uploadChunk'])
            ->middleware('permission:question.edit');
        Route::post('/questions/upload/complete', [AdminQuestionController::class, 'uploadComplete'])
            ->middleware('permission:question.edit');

        // 固件
        Route::get('/device-firmwares', [AdminFirmwareController::class, 'index'])
            ->middleware('role_or_permission:firmware.view|firmware.edit|firmware.delete');
        Route::get('/device-firmwares/local-files', [AdminFirmwareController::class, 'localFiles'])
            ->middleware('role_or_permission:firmware.view|firmware.edit|firmware.delete');
        Route::post('/device-firmwares/register-local', [AdminFirmwareController::class, 'registerLocal'])
            ->middleware('permission:firmware.edit');
        Route::post('/device-firmwares/upload/init', [AdminFirmwareController::class, 'uploadInit'])
            ->middleware('permission:firmware.edit');
        Route::post('/device-firmwares/upload/chunk', [AdminFirmwareController::class, 'uploadChunk'])
            ->middleware('permission:firmware.edit');
        Route::post('/device-firmwares/upload/complete', [AdminFirmwareController::class, 'uploadComplete'])
            ->middleware('permission:firmware.edit');
        Route::post('/device-firmwares/upload', [AdminFirmwareController::class, 'uploadLegacy'])
            ->middleware('permission:firmware.edit');
        Route::put('/device-firmwares/{id}/default', [AdminFirmwareController::class, 'setDefault'])
            ->whereNumber('id')
            ->middleware('permission:firmware.edit');
        Route::put('/device-firmwares/{id}/remark', [AdminFirmwareController::class, 'updateRemark'])
            ->whereNumber('id')
            ->middleware('permission:firmware.edit');
        Route::delete('/device-firmwares/{id}', [AdminFirmwareController::class, 'destroy'])
            ->whereNumber('id')
            ->middleware('permission:firmware.delete');

        // 设备验证
        Route::get('/device-verification/settings', [AdminDeviceVerificationController::class, 'settings'])
            ->middleware('permission:device.view');
        Route::put('/device-verification/settings', [AdminDeviceVerificationController::class, 'updateSettings'])
            ->middleware('permission:device.view');
        Route::get('/devices', [AdminDeviceVerificationController::class, 'index'])
            ->middleware('permission:device.view');
        Route::get('/devices/{id}', [AdminDeviceVerificationController::class, 'show'])
            ->whereNumber('id')
            ->middleware('permission:device.view');
        Route::post('/devices', [AdminDeviceVerificationController::class, 'store'])
            ->middleware('permission:device.view');
        Route::put('/devices/{deviceId}', [AdminDeviceVerificationController::class, 'update'])
            ->middleware('permission:device.view');
        Route::delete('/devices/{deviceId}', [AdminDeviceVerificationController::class, 'destroy'])
            ->middleware('permission:device.view');
        Route::post('/devices/{deviceId}/reset-count', [AdminDeviceVerificationController::class, 'resetCount'])
            ->middleware('permission:device.view');
        Route::get('/devices/{deviceId}/keys', [AdminDeviceVerificationController::class, 'keys'])
            ->middleware('permission:device.keys.view');
        Route::get('/devices/{deviceId}/logs', [AdminDeviceVerificationController::class, 'logs'])
            ->middleware('permission:device.view');

        // 客服 / Telegram 设置
        Route::get('/chat/community-links', [AdminChatSettingsController::class, 'communityLinks'])
            ->middleware('permission:chat.settings');
        Route::put('/chat/community-links', [AdminChatSettingsController::class, 'updateCommunityLinks'])
            ->middleware('permission:chat.settings');
        Route::get('/chat-admins', [AdminChatSettingsController::class, 'chatAdmins'])
            ->middleware('permission:chat.settings');
        Route::put('/chat-admins/{id}', [AdminChatSettingsController::class, 'updateChatAdmin'])
            ->whereNumber('id')
            ->middleware('permission:chat.settings');
        Route::put('/chat-admins/{id}/chatbot', [AdminChatSettingsController::class, 'updateChatbot'])
            ->whereNumber('id')
            ->middleware('permission:chat.settings');
    });
});

// 尚未移植的接口：转发至旧 Node（用户聊天 WebSocket、设备公开验签等）
Route::any('/bridge/{path}', [LegacyBridgeController::class, 'handle'])
    ->where('path', '.*');
