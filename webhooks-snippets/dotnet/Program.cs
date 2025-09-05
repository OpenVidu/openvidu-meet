using System.Text.Json;

const int SERVER_PORT = 5080;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapPost("/webhook", async (HttpContext context) =>
{
    using var reader = new StreamReader(context.Request.Body);
    var bodyContent = await reader.ReadToEndAsync();

    var headers = context.Request.Headers.ToDictionary(
        h => h.Key.ToLower(),
        h => h.Value.ToString()
    );

    if (!WebhookValidator.IsWebhookEventValid(bodyContent, headers))
    {
        Console.WriteLine("Invalid webhook signature");
        context.Response.StatusCode = 401;
        await context.Response.WriteAsync("Invalid webhook signature");
        return;
    }

    Console.WriteLine($"Webhook received: {bodyContent}");
    context.Response.StatusCode = 200;
});

Console.WriteLine($"Webhook server listening on port {SERVER_PORT}");
app.Run($"http://0.0.0.0:{SERVER_PORT}");
