<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

$code = isset($_GET['code']) ? trim($_GET['code']) : '';
if (!preg_match('/^\d{4,6}$/', $code)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid stock code'], JSON_UNESCAPED_UNICODE);
    exit;
}

function fetch_twse_quote($code, $market) {
    $url = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={$market}_{$code}.tw&json=1&delay=0";
    $headers = "User-Agent: Mozilla/5.0\r\nReferer: https://mis.twse.com.tw/stock/index.jsp\r\nAccept: application/json,text/plain,*/*\r\n";
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 8,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false || trim($body) === '') {
        return null;
    }

    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['msgArray'][0])) {
        return null;
    }

    $quote = $data['msgArray'][0];
    $price = isset($quote['z']) ? (float) $quote['z'] : 0;
    if ($price <= 0) {
        return null;
    }

    $data['ok'] = true;
    $data['market'] = $market;
    return $data;
}

$result = fetch_twse_quote($code, 'tse') ?: fetch_twse_quote($code, 'otc');
if (!$result) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Quote unavailable'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);