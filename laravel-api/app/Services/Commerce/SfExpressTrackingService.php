<?php

namespace App\Services\Commerce;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * 顺丰丰桥路由查询（EXP_RECE_SEARCH_ROUTES）
 * 需在 .env 配置 SF_PARTNER_ID、SF_CHECK_WORD；未配置时仅返回官网查询链接。
 */
class SfExpressTrackingService
{
    public function isConfigured(): bool
    {
        $partnerId = trim((string) config('services.sf_express.partner_id', ''));
        $checkWord = trim((string) config('services.sf_express.check_word', ''));

        return $partnerId !== '' && $checkWord !== '';
    }

    public function externalTrackUrl(string $trackingNumber): string
    {
        // 顺丰官网不支持 URL 直查第三方单号，仅打开官方查件页（单号由前端复制）
        return 'https://www.sf-express.com/chn/sc/waybill';
    }

    /**
     * @return array{routes: array<int, array{time: string, location: string, remark: string}>, source: string, message: string|null}
     */
    public function queryRoutes(string $trackingNumber, string $phoneLast4 = ''): array
    {
        $trackingNumber = trim($trackingNumber);
        if ($trackingNumber === '') {
            return ['routes' => [], 'source' => 'none', 'message' => 'Empty tracking number'];
        }

        if (! $this->isConfigured()) {
            return [
                'routes' => [],
                'source' => 'external',
                'message' => 'SF API not configured',
            ];
        }

        try {
            // 优先携带手机号后四位查询；若无轨迹再回退到不带手机号，兼容不同面单场景
            $routes = $this->callSfApi($trackingNumber, $phoneLast4);
            if ($routes === [] && $phoneLast4 !== '') {
                $routes = $this->callSfApi($trackingNumber, '');
            }

            $message = null;
            if ($routes === []) {
                $message = $phoneLast4 === ''
                    ? 'No routes returned (phone tail missing?)'
                    : 'No routes returned';
            }

            return [
                'routes' => $routes,
                'source' => 'sf_api',
                'message' => $message,
            ];
        } catch (\Throwable $e) {
            Log::warning('SF express tracking failed', [
                'tracking' => $trackingNumber,
                'phoneLast4' => $phoneLast4,
                'error' => $e->getMessage(),
            ]);

            return [
                'routes' => [],
                'source' => 'external',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * @return array<int, array{time: string, location: string, remark: string}>
     */
    private function callSfApi(string $trackingNumber, string $phoneLast4): array
    {
        $msgData = [
            'language' => '0',
            'trackingType' => '1',
            'trackingNumber' => [$trackingNumber],
            'methodType' => '1',
        ];
        if ($phoneLast4 !== '') {
            $msgData['checkPhoneNo'] = $phoneLast4;
        }

        $msgDataStr = json_encode($msgData, JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        $checkWord = (string) config('services.sf_express.check_word');
        $msgDigest = $this->buildMsgDigest($msgDataStr, $timestamp, $checkWord);

        $sandbox = filter_var(config('services.sf_express.sandbox', false), FILTER_VALIDATE_BOOLEAN);
        $url = trim((string) ($sandbox
            ? config('services.sf_express.sandbox_url', '')
            : config('services.sf_express.prod_url', '')));
        if ($url === '') {
            // 兜底地址：避免配置缺失导致请求地址为空
            $url = $sandbox
                ? 'https://sfapi-sbox.sf-express.com/std/service'
                : 'https://bspgw.sf-express.com/std/service';
        }

        $response = Http::asForm()
            ->timeout(15)
            ->post($url, [
                'partnerID' => config('services.sf_express.partner_id'),
                'requestID' => str_replace('-', '', (string) \Illuminate\Support\Str::uuid()),
                'serviceCode' => 'EXP_RECE_SEARCH_ROUTES',
                'timestamp' => $timestamp,
                'msgData' => $msgDataStr,
                'msgDigest' => $msgDigest,
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('SF API HTTP '.$response->status());
        }

        $body = $response->json();
        if (! is_array($body)) {
            throw new \RuntimeException('Invalid SF API response');
        }

        if (($body['apiResultCode'] ?? '') !== 'A1000') {
            $code = (string) ($body['apiResultCode'] ?? '');
            $msg = (string) ($body['apiErrorMsg'] ?? $code);
            throw new \RuntimeException($code !== '' ? "{$code}: {$msg}" : $msg);
        }

        $apiResponseData = json_decode((string) ($body['apiResponseData'] ?? '{}'), true);
        if (! is_array($apiResponseData)) {
            return [];
        }

        if (isset($apiResponseData['success']) && $apiResponseData['success'] === false) {
            $err = (string) ($apiResponseData['errorMsg'] ?? $apiResponseData['errorCode'] ?? 'SF business error');
            throw new \RuntimeException($err);
        }

        $routeResps = $apiResponseData['msgData']['routeResps']
            ?? $apiResponseData['routeResps']
            ?? [];
        if (! is_array($routeResps)) {
            return [];
        }

        $rawRoutes = [];
        foreach ($routeResps as $resp) {
            $list = $resp['routes'] ?? [];
            if (! is_array($list)) {
                continue;
            }
            foreach ($list as $route) {
                if (is_array($route)) {
                    $rawRoutes[] = $route;
                }
            }
        }

        usort($rawRoutes, static function (array $a, array $b): int {
            return strcmp((string) ($b['acceptTime'] ?? ''), (string) ($a['acceptTime'] ?? ''));
        });

        return array_values(array_map(static function (array $route): array {
            return [
                'time' => (string) ($route['acceptTime'] ?? ''),
                'location' => (string) ($route['acceptAddress'] ?? ''),
                'remark' => (string) ($route['remark'] ?? ''),
            ];
        }, $rawRoutes));
    }

    /**
     * 丰桥「标准 MD5」签名（与控制台所选一致）：
     * Base64( MD5_binary( urlencode(msgData + timestamp + checkWord) ) )
     */
    private function buildMsgDigest(string $msgData, string $timestamp, string $checkWord): string
    {
        $plain = $msgData.$timestamp.$checkWord;

        return base64_encode(md5(urlencode($plain), true));
    }

    /** 从收货地址字符串提取手机号后四位（顺丰验单常用） */
    public static function phoneLast4FromAddress(?string $shippingAddress): string
    {
        if (! $shippingAddress) {
            return '';
        }
        if (preg_match('/(?:phone|电话|手机号?)\s*[:：]\s*([^\|\n\r]+)/iu', $shippingAddress, $m)) {
            $digits = preg_replace('/\D+/', '', $m[1]);

            return strlen($digits) >= 4 ? substr($digits, -4) : $digits;
        }

        // 兼容历史订单：地址串中直接含手机号（无 key）
        if (preg_match('/(1[3-9]\d{9})/', $shippingAddress, $m)) {
            return substr($m[1], -4);
        }

        return '';
    }
}
