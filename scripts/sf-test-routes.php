#!/usr/bin/env php
<?php
/**
 * 顺丰路由查询联调脚本（绕过丰桥测试工具「调用地址灰色不可改」的限制）
 *
 * 用法：
 *   php scripts/sf-test-routes.php sandbox
 *   php scripts/sf-test-routes.php prod
 */

declare(strict_types=1);

$env = strtolower($argv[1] ?? 'prod');
$partnerId = getenv('SF_PARTNER_ID') ?: 'Y9RC580J';
$sandboxWord = 'S3wu3suiLa8WZhmPZgZpgEY0LUanN7tF';
$prodWord = 'kSfsdeNH0eMLXpWXn5e6JNdlBzcCBXuo';

$config = match ($env) {
    'sandbox', 'sbox', '沙箱' => [
        'label' => '沙箱',
        'url' => 'https://sfapi-sbox.sf-express.com/std/service',
        'checkWord' => $sandboxWord,
    ],
    'prod', 'production', '生产' => [
        'label' => '生产',
        'url' => 'https://bspgw.sf-express.com/std/service',
        'checkWord' => $prodWord,
    ],
    default => throw new RuntimeException('用法: php scripts/sf-test-routes.php [sandbox|prod]'),
};

$msgData = '{"language":"0","trackingType":"1","trackingNumber":["444003077898","441003077850"],"methodType":"1"}';
$timestamp = (string) time();
$plain = $msgData.$timestamp.$config['checkWord'];
$msgDigest = base64_encode(md5(urlencode($plain), true));

$post = http_build_query([
    'partnerID' => $partnerId,
    'requestID' => bin2hex(random_bytes(16)),
    'serviceCode' => 'EXP_RECE_SEARCH_ROUTES',
    'timestamp' => $timestamp,
    'msgData' => $msgData,
    'msgDigest' => $msgDigest,
]);

$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded;charset=UTF-8\r\n",
        'content' => $post,
        'timeout' => 20,
        'ignore_errors' => true,
    ],
]);

$response = file_get_contents($config['url'], false, $ctx);
$json = json_decode((string) $response, true) ?: [];

echo "环境: {$config['label']}\n";
echo "地址: {$config['url']}\n";
echo "partnerID: {$partnerId}\n";
echo "serviceCode: EXP_RECE_SEARCH_ROUTES\n";
echo "msgData: {$msgData}\n";
echo "timestamp: {$timestamp}\n";
echo "msgDigest: {$msgDigest}\n";
echo "结果: ".($json['apiResultCode'] ?? 'ERR').' | '.($json['apiErrorMsg'] ?? (string) $response)."\n";
echo 'apiResponseID: '.($json['apiResponseID'] ?? '-')."\n";

if (($json['apiResultCode'] ?? '') === 'A1004') {
    echo "\n说明: A1004 = 签名已通过，接口尚未上线。请在丰桥对该 API 点「上线」。\n";
} elseif (($json['apiResultCode'] ?? '') === 'A1006' && $env !== 'prod') {
    echo "\n说明: 沙箱路由查询对该应用不可用（非校验码问题）。请用 prod 模式测试，或联系顺丰工单。\n";
} elseif (($json['apiResultCode'] ?? '') === 'A1000') {
    echo "\n说明: 成功！接口已可用。\n";
    if (! empty($json['apiResultData'])) {
        echo "apiResultData: {$json['apiResultData']}\n";
    }
}
