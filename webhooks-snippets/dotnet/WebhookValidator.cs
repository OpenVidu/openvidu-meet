using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class WebhookValidator
{
    private const long MAX_WEBHOOK_AGE = 120 * 1000; // 2 minutes in milliseconds
    private const string OPENVIDU_MEET_API_KEY = "meet-api-key";

    public static bool IsWebhookEventValid(string body, Dictionary<string, string> headers)
    {
        if (!headers.TryGetValue("x-signature", out var signature) ||
            !headers.TryGetValue("x-timestamp", out var timestampStr))
        {
            return false;
        }

        if (!long.TryParse(timestampStr, out long timestamp))
        {
            return false;
        }

        long current = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        long diffTime = current - timestamp;
        if (diffTime >= MAX_WEBHOOK_AGE)
        {
            return false;
        }

        string signedPayload = $"{timestamp}.{body}";

        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(OPENVIDU_MEET_API_KEY)))
        {
            byte[] expected = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
            byte[] actual = Convert.FromHexString(signature);

            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
    }
}