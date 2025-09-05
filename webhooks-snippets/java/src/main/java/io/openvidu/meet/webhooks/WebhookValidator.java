package io.openvidu.meet.webhooks;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public class WebhookValidator {
    private static final long MAX_WEBHOOK_AGE = 120 * 1000; // 2 minutes in milliseconds
    private static final String OPENVIDU_MEET_API_KEY = "meet-api-key";

    public boolean isWebhookEventValid(Object body, Map<String, String> headers) {
        String signature = headers.get("x-signature"); 
        String ts = headers.get("x-timestamp");
        if (signature == null || ts == null) return false;

        long timestamp;
        try {
            timestamp = Long.parseLong(ts);
        } catch (NumberFormatException e) {
            return false;
        }

        long current = System.currentTimeMillis();
        long diffTime = current - timestamp;
        if (diffTime >= MAX_WEBHOOK_AGE) {
            // Webhook event too old
            return false;
        }

        String signedPayload = timestamp + "." + body.toString(); 

        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(
                new SecretKeySpec(
                    OPENVIDU_MEET_API_KEY.getBytes(StandardCharsets.UTF_8), 
                    "HmacSHA256"
                )
            );
            byte[] expected = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
            byte[] actual = hexToBytes(signature);

            return timingSafeEqual(expected, actual); 
        } catch (Exception e) {
            return false;
        }
    }

    // Helper method to convert hex string to byte array
    private byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    // Time safe comparison to prevent timing attacks
    private boolean timingSafeEqual(byte[] a, byte[] b) {
        if (a.length != b.length) return false;
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }
}