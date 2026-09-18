import express from "express";
import crypto from "crypto";

const SERVER_PORT = 5080;
const OPENVIDU_MEET_API_KEY = "meet-api-key";
const MAX_WEBHOOK_AGE = 120 * 1000; // 2 minutes in milliseconds

const app = express();
// Keep the body exactly as received: the signature covers those bytes, and re-serializing the
// parsed object is not guaranteed to reproduce them.
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf.toString("utf8");
        },
    })
);

app.post("/webhook", (req, res) => {
    const body = req.body;
    const headers = req.headers;

    if (!isWebhookEventValid(req.rawBody, headers)) {
        console.error("Invalid webhook signature");
        return res.status(401).send("Invalid webhook signature");
    }

    console.log("Webhook received:", body);
    res.status(200).send();
});

app.listen(SERVER_PORT, () =>
    console.log("Webhook server listening on port " + SERVER_PORT)
);

function isWebhookEventValid(rawBody, headers) {
    const signature = headers["x-signature"];
    const timestamp = parseInt(headers["x-timestamp"], 10);

    if (!signature || !timestamp || isNaN(timestamp)) {
        return false;
    }

    const current = Date.now();
    const diffTime = current - timestamp;
    if (diffTime >= MAX_WEBHOOK_AGE) {
        // Webhook event too old
        return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
        .createHmac("sha256", OPENVIDU_MEET_API_KEY)
        .update(signedPayload, "utf8")
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature, "hex")
    );
}
