<?php

namespace App\Support;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

/**
 * 认证 API 响应：始终附带 error_code；SPA 应优先用 error_code 走前端 i18n
 */
class AuthApiMessages
{
    public static function locale(Request $request): string
    {
        $raw = strtolower((string) $request->header('Accept-Language', 'en'));

        return str_starts_with($raw, 'zh') ? 'zh' : 'en';
    }

    /** @return array<string, string> */
    private static function catalog(string $locale): array
    {
        return match ($locale) {
            'zh' => [
                'invalid_credentials' => '用户名或密码错误',
                'account_suspended' => '账号已被停用',
                'no_admin_access' => '无后台访问权限',
                'username_taken' => '用户名已存在',
                'email_taken' => '邮箱已被注册',
                'password_min' => '密码至少 6 位',
                'username_required' => '请输入用户名',
                'email_required' => '请输入邮箱',
                'email_invalid' => '邮箱格式不正确',
                'password_required' => '请输入密码',
                'admin_ip_denied' => '当前 IP 不允许访问后台',
                'unauthorized' => '未登录或会话已失效',
                'validation_failed' => '请检查填写内容',
            ],
            default => [
                'invalid_credentials' => 'Invalid username or password',
                'account_suspended' => 'Account suspended',
                'no_admin_access' => 'No admin access',
                'username_taken' => 'Username already exists',
                'email_taken' => 'Email already in use',
                'password_min' => 'Password must be at least 6 characters',
                'username_required' => 'Username is required',
                'email_required' => 'Email is required',
                'email_invalid' => 'Invalid email address',
                'password_required' => 'Password is required',
                'admin_ip_denied' => 'Admin access denied from this IP',
                'unauthorized' => 'Unauthorized',
                'validation_failed' => 'Please check your input',
            ],
        };
    }

    public static function get(string $code, Request $request): string
    {
        $locale = self::locale($request);
        $catalog = self::catalog($locale);

        return $catalog[$code] ?? self::catalog('en')[$code] ?? $code;
    }

    public static function jsonError(Request $request, string $field, string $code, int $status = 422): JsonResponse
    {
        $message = self::get($code, $request);

        return response()->json([
            'message' => $message,
            'error_code' => $code,
            'errors' => [$field => [$message]],
        ], $status);
    }

    public static function throwError(Request $request, string $field, string $code, int $status = 422): never
    {
        throw new HttpResponseException(self::jsonError($request, $field, $code, $status));
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $rules
     */
    public static function validateOrFail(Request $request, array $data, array $rules): array
    {
        $validator = Validator::make($data, $rules, self::validationMessages($request));

        if ($validator->fails()) {
            throw new HttpResponseException(self::validationFailedResponse($request, $validator));
        }

        return $validator->validated();
    }

    /** @return array<string, string> */
    private static function validationMessages(Request $request): array
    {
        return [
            'username.required' => self::get('username_required', $request),
            'username.unique' => self::get('username_taken', $request),
            'email.required' => self::get('email_required', $request),
            'email.email' => self::get('email_invalid', $request),
            'email.unique' => self::get('email_taken', $request),
            'password.required' => self::get('password_required', $request),
            'password.min' => self::get('password_min', $request),
        ];
    }

    private static function validationFailedResponse(Request $request, ValidatorInstance $validator): JsonResponse
    {
        $errors = $validator->errors();
        $code = self::codeFromValidator($validator);

        return response()->json([
            'message' => $errors->first() ?: self::get('validation_failed', $request),
            'error_code' => $code,
            'errors' => $errors,
        ], 422);
    }

    private static function codeFromValidator(ValidatorInstance $validator): string
    {
        $failed = $validator->failed();
        if (isset($failed['username']['Unique'])) {
            return 'username_taken';
        }
        if (isset($failed['email']['Unique'])) {
            return 'email_taken';
        }
        if (isset($failed['password']['Min'])) {
            return 'password_min';
        }
        if (isset($failed['email']['Email'])) {
            return 'email_invalid';
        }
        if (isset($failed['username']['Required'])) {
            return 'username_required';
        }
        if (isset($failed['email']['Required'])) {
            return 'email_required';
        }
        if (isset($failed['password']['Required'])) {
            return 'password_required';
        }

        return 'validation_failed';
    }
}
