<?php

const MAX_WEBHOOK_AGE = 120 * 1000; // 2 minutes in milliseconds
const OPENVIDU_MEET_API_KEY = "meet-api-key";

$requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($requestMethod === 'POST' && $requestPath === '/webhook') {
    handleWebhook();
} else {
    http_response_code(404);
    echo "Not Found\n";
}

function handleWebhook()
{
    // Keep the body exactly as received: the signature covers those bytes, and re-encoding the
    // decoded value is not guaranteed to reproduce them.
    $rawBody = file_get_contents('php://input');
    $body    = json_decode($rawBody, true) ?? [];
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);

    if (!isWebhookEventValid($rawBody, $headers)) {
        http_response_code(401);
        echo "Invalid webhook signature\n";
        return;
    }

    http_response_code(200);
    $msg = "Webhook received: " . json_encode($body);
    echo $msg . "\n";
    error_log($msg); // Log to server console
}

function isWebhookEventValid($rawBody, $headers)
{
    $signature = $headers['x-signature'] ?? null;
    $timestampStr = $headers['x-timestamp'] ?? null;
    if (!$signature || !$timestampStr) {
        return false;
    }

    $timestamp = filter_var($timestampStr, FILTER_VALIDATE_INT);
    if ($timestamp === false) {
        return false;
    }

    $current = intval(microtime(true) * 1000);
    $diffTime = $current - $timestamp;
    if ($diffTime >= MAX_WEBHOOK_AGE) {
        return false;
    }

    $signedPayload = $timestamp . '.' . $rawBody;

    $expected = hash_hmac('sha256', $signedPayload, OPENVIDU_MEET_API_KEY);

    return hash_equals($expected, $signature);
}
