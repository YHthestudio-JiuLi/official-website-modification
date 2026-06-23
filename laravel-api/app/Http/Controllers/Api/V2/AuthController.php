<?php

namespace App\Http\Controllers\Api\V2;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
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
            throw ValidationException::withMessages([
                'username' => ['Invalid credentials'],
            ]);
        }

        /** @var User $user */
        $user = $guard->user();

        if (($user->status ?? 'active') !== 'active') {
            $guard->logout();
            throw ValidationException::withMessages(['username' => ['Account suspended']]);
        }

        if (! $user->canAccessAdmin()) {
            $guard->logout();
            throw ValidationException::withMessages(['username' => ['No admin access']]);
        }

        $this->finalizeLoginSession($request, 'admin');

        $user->load(['roles', 'agent']);

        return response()->json([
            'user' => new UserResource($user),
            'admin' => new UserResource($user),
            'permissions' => $user->getAllPermissions()->pluck('name'),
        ]);
    }

    /** 前台用户注册 */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
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
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $user->load(['roles', 'agent']);

        return response()->json([
            'admin' => new UserResource($user),
            'user' => new UserResource($user),
            'permissions' => $user->getAllPermissions()->pluck('name'),
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
            throw ValidationException::withMessages([
                'username' => ['Invalid credentials'],
            ]);
        }

        /** @var User $user */
        $user = $guard->user();

        if (($user->status ?? 'active') !== 'active') {
            $guard->logout();
            throw ValidationException::withMessages(['username' => ['Account suspended']]);
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
            return response()->json(['error' => 'Unauthorized'], 401);
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

    private function enforceAdminIpWhitelist(Request $request): void
    {
        $whitelist = config('security.admin_ip_whitelist', []);
        if ($whitelist === []) {
            return;
        }

        $ip = $request->ip();
        if (! in_array($ip, $whitelist, true)) {
            abort(403, 'Admin access denied from this IP');
        }
    }
}
