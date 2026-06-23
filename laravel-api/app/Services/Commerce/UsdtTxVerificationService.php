<?php

namespace App\Services\Commerce;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * USDT（TRC20）链上交易校验
 */
class UsdtTxVerificationService
{
    private const USDT_CONTRACT = 'TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T';

    public const DEFAULT_MAX_UNDERPAY_USDT = 5;

    public const DEFAULT_MAX_AGE_HOURS = 2;

    /**
     * @return array{valid: bool, delete_order: bool, reason: string, paid_amount: ?float, tx_timestamp_ms: ?int}
     */
    public function verify(
        string $network,
        string $txHash,
        float $expectedAmountUsdt,
        ?float $maxUnderpayUsdt = null,
        ?int $maxAgeHours = null,
        ?string $expectedWalletAddress = null
    ): array {
        $maxUnderpay = $maxUnderpayUsdt ?? self::DEFAULT_MAX_UNDERPAY_USDT;
        $maxAge = $maxAgeHours ?? self::DEFAULT_MAX_AGE_HOURS;
        $hash = trim($txHash);
        if ($hash === '') {
            return $this->result(false, false, 'empty_tx_hash');
        }
        if ($expectedAmountUsdt <= 0) {
            return $this->result(false, false, 'invalid_order_amount');
        }

        // 两项规则均为 0：不开启链上验单，仅校验哈希已填写
        if ($maxUnderpay <= 0 && $maxAge <= 0) {
            return $this->result(true, false, 'ok');
        }

        $net = strtoupper($network);
        if (! str_contains($net, 'TRC20') && ! str_contains($net, 'TRON')) {
            return $this->result(false, false, 'unsupported_network');
        }

        $tx = $this->queryTronUsdtTransfer($hash);
        if ($tx === null) {
            return $this->result(false, false, 'tx_not_found');
        }

        $paidAmount = $this->parseUsdtAmount($tx['paid_amount'] ?? '');
        if ($paidAmount === null) {
            return $this->result(false, false, 'amount_unreadable');
        }

        $txTimestampMs = (int) ($tx['block_timestamp_ms'] ?? 0);
        $expectedWallet = $this->normalizeTronAddress($expectedWalletAddress ?? '');
        if ($expectedWallet !== null) {
            $actualWallet = $this->normalizeTronAddress($tx['to_address'] ?? '');
            if ($actualWallet === null || $actualWallet !== $expectedWallet) {
                return $this->result(false, true, 'wrong_recipient_address', $paidAmount, $txTimestampMs);
            }
        }

        if ($maxAge > 0 && $txTimestampMs > 0) {
            $ageMs = (int) round(microtime(true) * 1000) - $txTimestampMs;
            if ($ageMs > $maxAge * 3600 * 1000) {
                return $this->result(false, true, 'tx_too_old', $paidAmount, $txTimestampMs);
            }
        }

        if ($maxUnderpay > 0) {
            $minAccepted = $expectedAmountUsdt - $maxUnderpay;
            if ($paidAmount < $minAccepted) {
                return $this->result(false, true, 'amount_insufficient', $paidAmount, $txTimestampMs);
            }
        }

        return $this->result(true, false, 'ok', $paidAmount, $txTimestampMs);
    }

    public function messageForReason(
        string $reason,
        float $expectedAmount,
        ?float $paidAmount = null,
        float $maxUnderpayUsdt = self::DEFAULT_MAX_UNDERPAY_USDT,
        int $maxAgeHours = self::DEFAULT_MAX_AGE_HOURS
    ): string {
        return match ($reason) {
            'wrong_recipient_address' => 'Recipient address mismatch. The platform cannot verify this payment.',
            'amount_insufficient' => sprintf(
                'Payment amount mismatch: paid %.2f USDT, order requires %.2f USDT (tolerance %.2f USDT). Order cannot be created.',
                $paidAmount ?? 0,
                $expectedAmount,
                $maxUnderpayUsdt
            ),
            'tx_too_old' => sprintf(
                'Transaction is older than %d hours. Order cannot be created.',
                $maxAgeHours
            ),
            'tx_not_found' => 'Unable to verify transaction on chain. Please check the hash and try again.',
            'amount_unreadable' => 'Unable to read payment amount from transaction.',
            'unsupported_network' => 'Automatic verification is only supported for TRC20 currently.',
            default => 'Payment verification failed.',
        };
    }

    public function messageForReasonZh(
        string $reason,
        float $expectedAmount,
        ?float $paidAmount = null,
        float $maxUnderpayUsdt = self::DEFAULT_MAX_UNDERPAY_USDT,
        int $maxAgeHours = self::DEFAULT_MAX_AGE_HOURS
    ): string {
        return match ($reason) {
            'wrong_recipient_address' => '地址信息有误，平台无法核验付款信息',
            'amount_insufficient' => sprintf(
                '支付金额不符：链上 %.2f USDT，订单 %.2f USDT（允许少付不超过 %.2f USDT）。订单无法生成。',
                $paidAmount ?? 0,
                $expectedAmount,
                $maxUnderpayUsdt
            ),
            'tx_too_old' => sprintf('交易时间超过 %d 小时，订单无法生成。', $maxAgeHours),
            'tx_not_found' => '链上未找到该交易，请核对哈希后重试。',
            'amount_unreadable' => '无法从交易中读取支付金额。',
            'unsupported_network' => '当前仅支持 TRC20 网络自动验单。',
            default => '支付校验失败。',
        };
    }

    /**
     * @return array{valid: bool, delete_order: bool, reason: string, paid_amount: ?float, tx_timestamp_ms: ?int}
     */
    private function result(
        bool $valid,
        bool $deleteOrder,
        string $reason,
        ?float $paidAmount = null,
        ?int $txTimestampMs = null
    ): array {
        return [
            'valid' => $valid,
            'delete_order' => $deleteOrder,
            'reason' => $reason,
            'paid_amount' => $paidAmount,
            'tx_timestamp_ms' => $txTimestampMs,
        ];
    }

    private function parseUsdtAmount(string $raw): ?float
    {
        $text = trim($raw);
        if ($text === '' || strtoupper($text) === 'N/A') {
            return null;
        }
        if (! preg_match('/[\d]+(?:\.[\d]+)?/', $text, $m)) {
            return null;
        }
        $value = (float) $m[0];

        return is_finite($value) ? $value : null;
    }

    /** @return array{paid_amount: string, block_timestamp_ms: int}|null */
    private function queryTronUsdtTransfer(string $hash): ?array
    {
        try {
            $eventsRes = Http::timeout(15)->get("https://api.trongrid.io/v1/transactions/{$hash}/events");
            $txInfoRes = Http::timeout(15)->post('https://api.trongrid.io/wallet/gettransactioninfobyid', [
                'value' => $hash,
            ]);
            $txRes = Http::timeout(15)->post('https://api.trongrid.io/wallet/gettransactionbyid', [
                'value' => $hash,
            ]);

            $events = $eventsRes->json('data') ?? [];
            $txInfo = $txInfoRes->json() ?? [];
            $tx = $txRes->json() ?? [];

            $transfer = null;
            foreach ($events as $event) {
                if (strtolower((string) ($event['event_name'] ?? '')) !== 'transfer') {
                    continue;
                }
                if (strtoupper((string) ($event['contract_address'] ?? '')) === self::USDT_CONTRACT) {
                    $transfer = $event;
                    break;
                }
                $transfer ??= $event;
            }

            $contractValue = $tx['raw_data']['contract'][0]['parameter']['value'] ?? [];
            $ownerAddressHex = trim((string) ($contractValue['owner_address'] ?? ''));
            $dataHex = strtolower((string) ($contractValue['data'] ?? ''));
            $toAddressHex = '';
            $amountRaw = '';
            if (strlen($dataHex) >= (8 + 64 * 3)) {
                $arg2 = substr($dataHex, 8 + 64, 64);
                $arg3 = substr($dataHex, 8 + 128, 64);
                $toAddressHex = substr($arg2, -40);
                $amountRaw = $this->hexToDecimalString($arg3);
            }
            if ($amountRaw === '' && is_array($transfer)) {
                $amountRaw = (string) ($transfer['result']['value'] ?? $transfer['result']['2'] ?? '0');
            }

            $fromAddress = $ownerAddressHex !== ''
                ? $this->tronHexToBase58($ownerAddressHex)
                : $this->tronHexToBase58((string) ($transfer['result']['from'] ?? $transfer['result']['0'] ?? ''));
            $toAddress = $toAddressHex !== ''
                ? $this->tronHexToBase58($toAddressHex)
                : $this->tronHexToBase58((string) ($transfer['result']['to'] ?? $transfer['result']['1'] ?? ''));

            $blockTimestampMs = (int) (
                $txInfo['blockTimeStamp'] ??
                $tx['raw_data']['timestamp'] ??
                ($transfer['block_timestamp'] ?? 0)
            );

            return [
                'paid_amount' => $this->formatUsdtFromRawValue($amountRaw),
                'block_timestamp_ms' => $blockTimestampMs,
                'from_address' => $fromAddress,
                'to_address' => $toAddress,
            ];
        } catch (\Throwable $e) {
            Log::warning('[USDT Verify] tron query failed', [
                'hash' => $hash,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function formatUsdtFromRawValue(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '' || ! ctype_digit($raw)) {
            return 'N/A';
        }

        $len = strlen($raw);
        if ($len <= 6) {
            $frac = str_pad($raw, 6, '0', STR_PAD_LEFT);
            $frac = rtrim($frac, '0');

            return $frac === '' ? '0 USDT' : '0.'.$frac.' USDT';
        }

        $intPart = ltrim(substr($raw, 0, -6), '0') ?: '0';
        $fracPart = rtrim(substr($raw, -6), '0');

        return $fracPart === ''
            ? $intPart.' USDT'
            : $intPart.'.'.$fracPart.' USDT';
    }

    private function hexToDecimalString(string $hex): string
    {
        $hex = strtolower(ltrim($hex, '0')) ?: '0';
        $dec = '0';
        for ($i = 0, $len = strlen($hex); $i < $len; $i++) {
            $dec = bcmul($dec, '16', 0);
            $dec = bcadd($dec, (string) hexdec($hex[$i]), 0);
        }

        return $dec;
    }

    private function normalizeTronAddress(?string $address): ?string
    {
        $text = trim((string) $address);
        if ($text === '' || strtoupper($text) === 'N/A') {
            return null;
        }

        return $text;
    }

    private function tronHexToBase58(string $input): string
    {
        $raw = strtolower(trim(str_replace('0x', '', $input)));
        if ($raw === '') {
            return 'N/A';
        }
        if (str_starts_with($raw, '41') && strlen($raw) === 42) {
            $hex = $raw;
        } elseif (strlen($raw) === 40) {
            $hex = '41'.$raw;
        } elseif (strlen($raw) > 42) {
            $hex = '41'.substr($raw, -40);
        } else {
            return $input;
        }
        $payload = hex2bin($hex);
        if ($payload === false) {
            return 'N/A';
        }
        $hash1 = hash('sha256', $payload, true);
        $hash2 = hash('sha256', $hash1, true);

        return $this->base58Encode($payload.substr($hash2, 0, 4));
    }

    private function base58Encode(string $binary): string
    {
        $alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        $hex = bin2hex($binary);
        if (! function_exists('gmp_init')) {
            return 'N/A';
        }
        $num = gmp_init($hex, 16);
        $base = gmp_init(58);
        $out = '';
        while (gmp_cmp($num, 0) > 0) {
            $rem = gmp_mod($num, $base);
            $num = gmp_div_q($num, $base);
            $out = $alphabet[gmp_intval($rem)].$out;
        }
        for ($i = 0, $len = strlen($binary); $i < $len && ord($binary[$i]) === 0; $i++) {
            $out = '1'.$out;
        }

        return $out !== '' ? $out : 'N/A';
    }
}
