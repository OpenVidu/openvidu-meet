import hashlib
import hmac
import json
import time
from flask import Flask, request

SERVER_PORT = 5080
MAX_WEBHOOK_AGE = 120 * 1000  # 2 minutes in milliseconds
OPENVIDU_MEET_API_KEY = "meet-api-key"

app = Flask(__name__)


@app.route("/webhook", methods=["POST"])
def webhook():
    body = request.get_json()
    headers = request.headers

    if not is_webhook_event_valid(body, headers):
        print("Invalid webhook signature")
        return "Invalid webhook signature", 401

    print("Webhook received:", body)
    return "", 200


def is_webhook_event_valid(body, headers):
    signature = headers.get("x-signature")
    timestamp_str = headers.get("x-timestamp")
    if not signature or not timestamp_str:
        return False

    try:
        timestamp = int(timestamp_str)
    except ValueError:
        return False

    current = int(time.time() * 1000)
    diff_time = current - timestamp
    if diff_time >= MAX_WEBHOOK_AGE:
        return False

    json_body = json.dumps(body, separators=(",", ":"))
    signed_payload = str(timestamp) + "." + json_body

    expected = hmac.new(
        OPENVIDU_MEET_API_KEY.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


if __name__ == "__main__":
    print("Webhook server listening on port " + str(SERVER_PORT))
    app.run(debug=False, host="0.0.0.0", port=SERVER_PORT)
