<?php

namespace App\Services\Commerce;

use App\Models\PaymentSetting;

class PaymentSettingsService
{
    public const DEFAULT_TX_VERIFY_MAX_UNDERPAY_USDT = 5.0;

    public const DEFAULT_TX_VERIFY_MAX_AGE_HOURS = 2;

    public function get(): array
    {
        $row = PaymentSetting::query()->orderByDesc('id')->first();
        if (! $row) {
            return $this->defaults('');
        }

        return $this->formatRow($row);
    }

    /** 链上验单规则（供 OrderService 等使用） */
    public function txVerifyRules(): array
    {
        $s = $this->get();

        return [
            'maxUnderpayUsdt' => $s['txVerifyMaxUnderpayUsdt'] !== null
                ? (float) $s['txVerifyMaxUnderpayUsdt']
                : self::DEFAULT_TX_VERIFY_MAX_UNDERPAY_USDT,
            'maxAgeHours' => $s['txVerifyMaxAgeHours'] !== null
                ? (int) $s['txVerifyMaxAgeHours']
                : self::DEFAULT_TX_VERIFY_MAX_AGE_HOURS,
        ];
    }

    public function getPublic(): array
    {
        $s = $this->get();

        return [
            'network' => $s['network'] ?? 'TRC20',
            'wallet_address' => $s['wallet_address'] ?? '',
        ];
    }

    public function update(array $data): array
    {
        $payload = [
            'wallet_address' => $data['wallet_address'],
            'network' => $data['network'] ?? 'TRC20',
            'autoDeleteMinutes' => max(1, (int) ($data['autoDeleteMinutes'] ?? 30)),
            'txVerifyMaxUnderpayUsdt' => array_key_exists('txVerifyMaxUnderpayUsdt', $data)
                ? max(0, (float) $data['txVerifyMaxUnderpayUsdt'])
                : self::DEFAULT_TX_VERIFY_MAX_UNDERPAY_USDT,
            'txVerifyMaxAgeHours' => array_key_exists('txVerifyMaxAgeHours', $data)
                ? max(0, (int) $data['txVerifyMaxAgeHours'])
                : self::DEFAULT_TX_VERIFY_MAX_AGE_HOURS,
            'updatedAt' => now(),
        ];

        $row = PaymentSetting::query()->orderByDesc('id')->first();
        if (! $row) {
            PaymentSetting::query()->create($payload);
        } else {
            $row->update($payload);
        }

        return $this->get();
    }

    private function formatRow(PaymentSetting $row): array
    {
        return [
            'network' => $row->network,
            'wallet_address' => $row->wallet_address,
            'autoDeleteMinutes' => (int) ($row->autoDeleteMinutes ?? 30),
            'txVerifyMaxUnderpayUsdt' => $row->txVerifyMaxUnderpayUsdt !== null
                ? (float) $row->txVerifyMaxUnderpayUsdt
                : self::DEFAULT_TX_VERIFY_MAX_UNDERPAY_USDT,
            'txVerifyMaxAgeHours' => $row->txVerifyMaxAgeHours !== null
                ? (int) $row->txVerifyMaxAgeHours
                : self::DEFAULT_TX_VERIFY_MAX_AGE_HOURS,
        ];
    }

    /** @return array<string, mixed> */
    private function defaults(string $wallet): array
    {
        return [
            'network' => 'TRC20',
            'wallet_address' => $wallet,
            'autoDeleteMinutes' => 30,
            'txVerifyMaxUnderpayUsdt' => self::DEFAULT_TX_VERIFY_MAX_UNDERPAY_USDT,
            'txVerifyMaxAgeHours' => self::DEFAULT_TX_VERIFY_MAX_AGE_HOURS,
        ];
    }
}
