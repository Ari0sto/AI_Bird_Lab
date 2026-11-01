
using BirdLab.CentralServer.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using RabbitMQ.Client;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// HTTP client for AI Server
var aiServerUrl = builder.Configuration["AI_SERVER_URL"]
    ?? "http://localhost:8000";

builder.Services.AddHttpClient("AI_Server", client =>
{
    client.BaseAddress = new Uri(aiServerUrl);
    client.Timeout = TimeSpan.FromMinutes(3);
});

// SQLite database
var authDbPath = builder.Configuration["AUTH_DB_PATH"]
    ?? "auth.db";

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite($"Data Source={authDbPath}"));

// Authentication and authorization
builder.Services.AddAuthorization();

builder.Services.AddIdentityApiEndpoints<IdentityUser>(options =>
{
    options.SignIn.RequireConfirmedEmail = false;
    options.Password.RequiredLength = 6;
})
.AddEntityFrameworkStores<ApplicationDbContext>();

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173"
              )
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Routing
app.UseRouting();

app.UseCors("Frontend");

// Create database if it does not exist
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.EnsureCreated();
}

// Authentication middleware
app.UseAuthentication();
app.UseAuthorization();

// Health check
app.MapGet("/health", () => Results.Ok(new
{
    status = "Central Server is running"
}));

// Identity endpoints
app.MapGroup("/api/auth").MapIdentityApi<IdentityUser>();

// Protected endpoint
app.MapGet("/api/user/me", (ClaimsPrincipal user) =>
{
    return Results.Ok(new
    {
        id = user.FindFirstValue(ClaimTypes.NameIdentifier),
        email = user.FindFirstValue(ClaimTypes.Email)
    });
})
.RequireAuthorization();

// Check connection to AI Server
app.MapGet("/api/ai/health", async (IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("AI_Server");

    try
    {
        var response = await client.GetAsync("/api/health");

        if (!response.IsSuccessStatusCode)
        {
            return Results.StatusCode(502);
        }

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(result, "application/json");
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
});

// Analyze image through AI Server
app.MapPost("/api/ai/analyze/image", async (
    IFormFile file,
    IHttpClientFactory factory) =>
{
    if (file.Length == 0)
    {
        return Results.BadRequest("File is empty.");
    }

    // Maximum image size: 12 MiB
    if (file.Length > 12 * 1024 * 1024)
    {
        return Results.StatusCode(413);
    }

    var client = factory.CreateClient("AI_Server");

    try
    {
        using var form = new MultipartFormDataContent();
        using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);

        content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(
                "application/octet-stream");
        

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

        form.Add(content, "file", "upload" + extension);

        var response = await client.PostAsync(
            "/api/analyze/image", form);

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(
            result,
            "application/json",
            statusCode: (int)response.StatusCode);
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.DisableAntiforgery()
.RequireAuthorization();

// Analyze audio through AI Server
app.MapPost("/api/ai/analyze/audio", async (
    IFormFile file,
    IHttpClientFactory factory) =>
{
    if (file.Length == 0)
    {
        return Results.BadRequest("File is empty.");
    }

    // Maximum audio size: 20 MiB
    if (file.Length > 20 * 1024 * 1024)
    {
        return Results.StatusCode(413);
    }

    var client = factory.CreateClient("AI_Server");

    try
    {
        using var form = new MultipartFormDataContent();
        using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);

        content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(
                "application/octet-stream");

        // Use ASCII filename for Python compatibility
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

        form.Add(content, "file", "upload" + extension);

        var response = await client.PostAsync(
            "/api/analyze/audio", form);

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(
            result,
            "application/json",
            statusCode: (int)response.StatusCode);
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.DisableAntiforgery()
.RequireAuthorization();

// Get analysis history
app.MapGet("/api/ai/history", async (
    string? search,
    IHttpClientFactory factory) =>
{
    if (search?.Length > 150)
    {
        return Results.BadRequest("Search is too long.");
    }

    var client = factory.CreateClient("AI_Server");

    try
    {
        var query = Uri.EscapeDataString(search ?? "");

        var response = await client.GetAsync(
            $"/api/history?search={query}");

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(
            result,
            "application/json",
            statusCode: (int)response.StatusCode);
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.RequireAuthorization();

// Get analysis statistics
app.MapGet("/api/ai/stats", async (
    IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("AI_Server");

    try
    {
        var response = await client.GetAsync("/api/stats");

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(
            result,
            "application/json",
            statusCode: (int)response.StatusCode);
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.RequireAuthorization();

// Delete analysis from history
app.MapDelete("/api/ai/history/{itemId:int}", async (
    int itemId,
    IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("AI_Server");

    try
    {
        var response = await client.DeleteAsync(
            $"/api/history/{itemId}");

        var result = await response.Content.ReadAsStringAsync();

        return Results.Content(
            result,
            "application/json",
            statusCode: (int)response.StatusCode);
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.RequireAuthorization();

// Export analysis history to CSV
app.MapGet("/api/ai/export", async (
    IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("AI_Server");

    try
    {
        var response = await client.GetAsync("/api/export");

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();

            return Results.Content(
                error,
                "application/json",
                statusCode: (int)response.StatusCode);
        }

        var csv = await response.Content.ReadAsByteArrayAsync();

        return Results.File(
            csv,
            "text/csv; charset=utf-8",
            "bird_analysis.csv");
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
})
.RequireAuthorization();


// Send a demonstration message to RabbitMQ
app.MapPost("/api/rabbitmq/send", async (
    RabbitMessageRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Message) ||
        request.Message.Length > 500)
    {
        return Results.BadRequest(new
        {
            error = "Message must contain 1-500 characters."
        });
    }

    const string queueName = "birdlab.demo";

    var messageId = Guid.NewGuid().ToString();

    var message = new
    {
        id = messageId,
        text = request.Message.Trim(),
        sentAtUtc = DateTimeOffset.UtcNow
    };

    var factory = new ConnectionFactory
    {
        HostName = builder.Configuration["RABBITMQ_HOST"]
            ?? "localhost",
        UserName = builder.Configuration["RABBITMQ_USER"]
            ?? "guest",
        Password = builder.Configuration["RABBITMQ_PASSWORD"]
            ?? "guest"
    };

    try
    {
        await using var connection =
            await factory.CreateConnectionAsync();

        await using var channel =
            await connection.CreateChannelAsync();

        // Create the queue if it does not exist
        await channel.QueueDeclareAsync(
            queue: queueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        var body = Encoding.UTF8.GetBytes(
            JsonSerializer.Serialize(message));

        var properties = new BasicProperties
        {
            ContentType = "application/json",
            DeliveryMode = DeliveryModes.Persistent,
        };

        await channel.BasicPublishAsync(
            exchange: "",
            routingKey: queueName,
            mandatory: true,
            basicProperties: properties,
            body: body);

        app.Logger.LogInformation(
            "RabbitMQ message published: {MessageId}",
            messageId);

        return Results.Ok(new
        {
            status = "published",
            id = messageId,
            queue = queueName
        });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(
            ex,
            "Failed to publish RabbitMQ message");

        return Results.Problem(
            "Could not publish message to RabbitMQ.",
            statusCode: 503);
    }
})
.RequireAuthorization();


app.Run();

record RabbitMessageRequest(string Message);
