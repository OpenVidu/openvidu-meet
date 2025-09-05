package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	serverPort         = "5080"
	maxWebhookAge      = 120 * 1000 // 2 minutes in milliseconds
	openviduMeetApiKey = "meet-api-key"
)

func main() {
	router := gin.Default()
	router.POST("/webhook", handleWebhook)
	router.Run(":" + serverPort)
}

func handleWebhook(c *gin.Context) {
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	if !isWebhookEventValid(bodyBytes, c.Request.Header) {
		log.Println("Invalid webhook signature")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid webhook signature"})
		return
	}

	log.Println("Webhook received:", string(bodyBytes))
	c.Status(http.StatusOK)
}

func isWebhookEventValid(bodyBytes []byte, headers http.Header) bool {
	signature := headers.Get("x-signature")
	tsStr := headers.Get("x-timestamp")
	if signature == "" || tsStr == "" {
		return false
	}

	timestamp, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return false
	}

	current := time.Now().UnixMilli()
	diffTime := current - timestamp
	if diffTime >= maxWebhookAge {
		return false
	}

	signedPayload := tsStr + "." + string(bodyBytes)

	mac := hmac.New(sha256.New, []byte(openviduMeetApiKey))
	mac.Write([]byte(signedPayload))
	expected := mac.Sum(nil)

	actual, err := hex.DecodeString(signature)
	if err != nil {
		return false
	}

	return subtle.ConstantTimeCompare(expected, actual) == 1
}
