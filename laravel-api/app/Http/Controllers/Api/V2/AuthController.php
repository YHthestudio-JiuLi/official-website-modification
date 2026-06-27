<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\AdminBootService;
use App\Services\Bridge\LegacyNodeBridgeTokenService;
use App\Support\AuthApiMessages;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\PermissionRegistrar;

class AuthController extends Controller
{
    public function __construct(
        private readonly AdminBootService $adminBoot,
        private readonly LegacyNodeBridgeTokenService $legacyNodeTokens,
    ) {}

    /** 登录后轮换 session：若另一 guard 已登录则仅刷新 CSRF，避免互相踢线 */
    private function finalizeLoginSession(Request $request, string $guardName): void
    {
        $peer = $guardName === 'admin' ? 'web' : 'admin';

        if (Auth::guard($peer)->check()) {
            $request->session()->regenerateToken();
        } else {
            $request->session()->regenerate();
        }

        $user = Auth::guard($guardName)->user();
        if ($user && $user->getAuthPassword()) {
            $request->session()->put('password_hash_'.$guardName, $user->getAuthPassword());
        }
    }

    /** 管理端登录（独立 admin guard，不写前台 web 会话） */
    public function adminLogin(Request $request): JsonResponse
    {
        $this->enforceAdminIpWhitelist($request);

        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $guard = Auth::guard('admin');

        if (! $guard->attempt(['username' => $credentials['username'], 'password' => $credentials['password']])) {
            AuthApiMessages::throwError($request, 'username', 'invalid_credentials', 422);
        }

        /** @var User $user */
        $user = $guard->user();

        if (($user->status ?? 'active') !== 'active') {
            $guard->logout();
            AuthApiMessages::throwError($request, 'username', 'account_suspended', 422);
        }

        if (! $user->canAccessAdmin()) {
            $guard->logout();
            AuthApiMessages::throwError($request, 'username', 'no_admin_access', 422);
        }

        $this->finalizeLoginSession($request, 'admin');
        $request->session()->put('admin_boot_id', $this->adminBoot->current());

        $user->load(['roles', 'agent']);
        $this->ensureAdminRoles($user);

        return response()->json([
            'user' => new UserResource($user),
            'admin' => new UserResource($user),
            'permissions' => $user->getAllPermissions()->pluck('name'),
        ]);
    }

    /** 前台用户注册 */
    public function register(Request $request): JsonResponse
    {
        $data = AuthApiMessages::validateOrFail($request, $request->all(), [
            'username' => ['required', 'string', 'max:255', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6', 'max:255'],
        ]);

        $user = User::query()->create([
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'user_type' => 'customer',
            'status' => 'active',
            'isAdmin' => 0,
        ]);
        $user->assignRole('customer');

        Auth::guard('web')->login($user);
        $this->finalizeLoginSession($request, 'web');

        return response()->json(['user' => new UserResource($user)], 201);
    }

    /** 管理端会话检查 */
    public function adminMe(Request $request): JsonResponse
    {
        $user = Auth::guard('admin')->user();
        if (! $user || ! $user->canAccessAdmin()) {
            return AuthApiMessages::jsonError($request, 'username', 'unauthorized', 401);
        }

        $user->load(['roles', 'agent']);

        $permissions = $user->getAllPermissions()->pluck('name');
        $request->attributes->set('resolved_permissions', $permissions);

        return response()->json([
            'admin' => new UserResource($user),
            'user' => new UserResource($user),
            'permissions' => $permissions,
        ]);
    }

    /** 前台用户登录（独立 web guard） */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $guard = Auth::guard('web');

        if (! $guard->attempt(['username' => $credentials['username'], 'password' => $credentials['password']])) {
            AuthApiMessages::throwError($request, 'username', 'invalid_credentials', 422);
        }

        /** @var User $user */
        $user = $guard->user();

        if (($user->status ?? 'active') !== 'active') {
            $guard->logout();
            AuthApiMessages::throwError($request, 'username', 'account_suspended', 422);
        }

        $this->finalizeLoginSession($request, 'web');

        return response()->json([
            'user' => new UserResource($user->load('roles')),
        ]);
    }

    /** 前台 /auth/me */
    public function me(Request $request): JsonResponse
    {
        $user = Auth::guard('web')->user();
        if (! $user) {
            return AuthApiMessages::jsonError($request, 'username', 'unauthorized', 401);
        }

        return response()->json([
            'user' => new UserResource($user->load('roles')),
        ]);
    }

    /** 仅退出前台会话，不影响后台 admin 登录 */
    public function userLogout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        return response()->json(['message' => 'Logged out']);
    }

    /** 仅退出后台会话，不影响前台用户登录 */
    public function adminLogout(Request $request): JsonResponse
    {
        Auth::guard('admin')->logout();

        return response()->json(['message' => 'Logged out']);
    }

    /**
     * 为已登录的前台用户签发短期令牌，供 Node 建立 legacy 会话（在线客服等）
     */
    public function userLegacyNodeBridgeToken(Request $request): JsonResponse
    {
        $user = Auth::guard('web')->user();
        if (! $user) {
            return AuthApiMessages::jsonError($request, 'username', 'unauthorized', 401);
        }

        $secret = config('services.legacy_node.internal_secret');
        if (! $secret) {
            return response()->json(['error' => 'Bridge not configured'], 503);
        }

        return response()->json([
            'token' => $this->legacyNodeTokens->mint($user->id),
        ]);
    }

    /**
     * 为已登录的管理员签发短期令牌，供前端在 Node 建立 legacy 会话（题库/固件/设备等）
     * 避免生产环境 Laravel 与 Node 双栈 Cookie 不同步导致反复登出
     */
    public function legacyNodeBridgeToken(Request $request): JsonResponse
    {
        $user = Auth::guard('admin')->user();
        if (! $user || ! $user->canAccessAdmin()) {
            return AuthApiMessages::jsonError($request, 'username', 'unauthorized', 401);
        }

        $secret = config('services.legacy_node.internal_secret');
        if (! $secret) {
            return response()->json(['error' => 'Bridge not configured'], 503);
        }

        return response()->json([
            'token' => $this->legacyNodeTokens->mint($user->id),
        ]);
    }

    /** Python 种子仅写 isAdmin=1，补挂 super_admin 以便 Spatie permission 中间件放行 */
    private function ensureAdminRoles(User $user): void
    {
        if (! $user->isAdmin) {
            return;
        }

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        if (! $user->hasRole('super_admin')) {
            $user->assignRole('super_admin');
        }

        if (empty($user->user_type) || $user->user_type === 'customer') {
            $user->update(['user_type' => 'super_admin', 'status' => 'active']);
        }
    }

    private function enforceAdminIpWhitelist(Request $request): void
    {
        $whitelist = config('security.admin_ip_whitelist', []);
        if ($whitelist === []) {
            return;
        }

        $ip = $request->ip();
        if (! in_array($ip, $whitelist, true)) {
            AuthApiMessages::throwError($request, 'username', 'admin_ip_denied', 403);
        }
    }
}
