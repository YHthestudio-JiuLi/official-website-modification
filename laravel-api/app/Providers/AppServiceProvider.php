<?php

namespace App\Providers;

use App\Hashing\CompatibleBcryptHasher;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // 对接旧库中 Node bcrypt（$2b$）密码
        Hash::extend('bcrypt', function () {
            return new CompatibleBcryptHasher([
                'rounds' => (int) config('hashing.bcrypt.rounds', 12),
                'verify' => (bool) config('hashing.bcrypt.verify', true),
            ]);
        });

        RateLimiter::for('login', function (Request $request) {
            $username = (string) $request->input('username', '');

            return [
                Limit::perMinute(5)->by($request->ip().'|'.$username),
                Limit::perHour(30)->by($request->ip()),
            ];
        });

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });
    }
}
