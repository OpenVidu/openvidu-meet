use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use tokio::net::TcpListener;

const SERVER_PORT: u16 = 5080;
const MAX_WEBHOOK_AGE: i64 = 120 * 1000; // 2 minutes in milliseconds
const OPENVIDU_MEET_API_KEY: &str = "meet-api-key";

type HmacSha256 = Hmac<Sha256>;

#[tokio::main]
async fn main() {
    println!("Webhook server listening on port {}", SERVER_PORT);

    let app = Router::new().route("/webhook", post(webhook_handler));

    let listener = TcpListener::bind(format!("0.0.0.0:{}", SERVER_PORT))
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}

async fn webhook_handler(
    headers: HeaderMap,
    request: Request,
) -> Result<Response<String>, StatusCode> {
    let body = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };

    let body_str = match std::str::from_utf8(&body) {
        Ok(s) => s,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };

    // Extract headers
    let mut header_map = HashMap::new();
    for (key, value) in headers.iter() {
        if let Ok(value_str) = value.to_str() {
            header_map.insert(key.as_str().to_lowercase(), value_str.to_string());
        }
    }

    if !is_webhook_event_valid(body_str, &header_map) {
        println!("Invalid webhook signature");
        return Ok(Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body("Invalid webhook signature".to_string())
            .unwrap());
    }

    println!("Webhook received: {}", body_str);
    Ok(Response::builder()
        .status(StatusCode::OK)
        .body("".to_string())
        .unwrap())
}

fn is_webhook_event_valid(body_str: &str, headers: &HashMap<String, String>) -> bool {
    let signature = match headers.get("x-signature") {
        Some(sig) => sig,
        None => return false,
    };

    let timestamp_str = match headers.get("x-timestamp") {
        Some(ts) => ts,
        None => return false,
    };

    let timestamp: i64 = match timestamp_str.parse() {
        Ok(ts) => ts,
        Err(_) => return false,
    };

    // Check timestamp age
    let current = Utc::now().timestamp_millis();
    let diff_time = current - timestamp;
    if diff_time >= MAX_WEBHOOK_AGE {
        return false;
    }

    // Create signed payload using the raw body string
    let signed_payload = format!("{}.{}", timestamp, body_str);

    // Calculate HMAC
    let mut mac = match HmacSha256::new_from_slice(OPENVIDU_MEET_API_KEY.as_bytes()) {
        Ok(mac) => mac,
        Err(_) => return false,
    };

    mac.update(signed_payload.as_bytes());
    let expected = mac.finalize().into_bytes();
    let expected_hex = hex::encode(expected);

    // Timing-safe comparison
    if signature.len() != expected_hex.len() {
        return false;
    }

    let mut result = 0u8;
    for (a, b) in signature.bytes().zip(expected_hex.bytes()) {
        result |= a ^ b;
    }
    result == 0
}
