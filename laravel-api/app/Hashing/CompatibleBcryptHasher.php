<?php

namespace App\Hashing;

use Illuminate\Hashing\BcryptHasher;
use RuntimeException;

/**
 * 兼容 Node.js bcrypt 生成的 $2b$ / $2a$ 哈希（PHP 原生为 $2y$，算法相同）
 */
class CompatibleBcryptHasher extends BcryptHasher
{
    public function check(#[\SensitiveParameter] $value, $hashedValue, array $options = []): bool
    {
        if (is_null($hashedValue) || strlen($hashedValue) === 0) {
            return false;
        }

        $normalized = $this->normalizeHash($hashedValue);

        if ($this->verifyAlgorithm && ! $this->isUsingCorrectAlgorithm($normalized)) {
            throw new RuntimeException('This password does not use the Bcrypt algorithm.');
        }

        return password_verify($value, $normalized);
    }

    public function needsRehash($hashedValue, array $options = []): bool
    {
        return parent::needsRehash($this->normalizeHash($hashedValue), $options);
    }

    private function normalizeHash(string $hashedValue): string
    {
        if (str_starts_with($hashedValue, '$2b$') || str_starts_with($hashedValue, '$2a$')) {
            return '$2y$'.substr($hashedValue, 4);
        }

        return $hashedValue;
    }
}
