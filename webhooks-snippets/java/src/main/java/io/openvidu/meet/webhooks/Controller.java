package io.openvidu.meet.webhooks;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Controller {

    @PostMapping("/webhook")
    public ResponseEntity<String> handleWebhook(@RequestBody String body, @RequestHeader Map<String, String> headers) {

        WebhookValidator validator = new WebhookValidator();

        if (!validator.isWebhookEventValid(body, headers)) {
            System.err.println("Invalid webhook signature");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid webhook signature");
        }

        System.out.println("Webhook received: " + body);
        return ResponseEntity.ok().build();
    }
}
