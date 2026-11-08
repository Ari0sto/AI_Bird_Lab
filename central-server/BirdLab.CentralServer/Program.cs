
using BirdLab.CentralServer.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using RabbitMQ.Client;
using System.Text;
using System.Text.Json;
using BirdLab.CentralServer.Services;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);

// Ethereum wallet verification service
builder.Services.AddSingleton<WalletService>();

builder.Services.AddSingleton<SubscriptionService>();

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

    // EnsureCreated does not add tables to existing SQLite databases.
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS FreeAnalysisQuotas (
            UserId TEXT NOT NULL PRIMARY KEY,
            UsedAttempts INTEGER NOT NULL DEFAULT 0,
            ReservedAttempts INTEGER NOT NULL DEFAULT 0
        );
    ");

    
    // Wallets linked to application users
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS UserWallets (
            Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            UserId TEXT NOT NULL,
            WalletAddress TEXT NOT NULL,
            LinkedAt TEXT NOT NULL
        );
    ");

    db.Database.ExecuteSqlRaw(@"
        CREATE UNIQUE INDEX IF NOT EXISTS IX_UserWallets_UserId
        ON UserWallets (UserId);
    ");

    db.Database.ExecuteSqlRaw(@"
        CREATE UNIQUE INDEX IF NOT EXISTS IX_UserWallets_WalletAddress
        ON UserWallets (WalletAddress);
    ");

    // Temporary wallet verification challenges
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS WalletChallenges (
            Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            UserId TEXT NOT NULL,
            WalletAddress TEXT NOT NULL,
            Nonce TEXT NOT NULL,
            ExpiresAt TEXT NOT NULL,
            IsUsed INTEGER NOT NULL DEFAULT 0
        );
    ");

    db.Database.ExecuteSqlRaw(@"
        CREATE UNIQUE INDEX IF NOT EXISTS IX_WalletChallenges_Nonce
        ON WalletChallenges (Nonce);
    ");

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


// Create a one-time message for MetaMask
app.MapPost("/api/wallet/challenge", async (
    WalletChallengeRequest request,
    ClaimsPrincipal user,
    ApplicationDbContext db,
    WalletService walletService) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (string.IsNullOrEmpty(userId))
        return Results.Unauthorized();

    string address;

    try
    {
        address = walletService.NormalizeAddress(request.WalletAddress);
    }
    catch (ArgumentException)
    {
        return Results.BadRequest(new
        {
            error = "INVALID_WALLET_ADDRESS"
        });
    }

    // Do not issue a challenge for another user's wallet.
    bool alreadyLinked = await db.UserWallets
        .AnyAsync(w => w.WalletAddress == address &&
                       w.UserId != userId);

    if (alreadyLinked)
        return Results.Conflict(new
        {
            error = "WALLET_ALREADY_LINKED"
        });

    string nonce = walletService.GenerateNonce();
    DateTime expiresAt = DateTime.UtcNow.AddMinutes(5);

    string message = walletService.CreateMessage(
        userId, address, nonce, expiresAt);

    db.WalletChallenges.Add(new WalletChallenge
    {
        UserId = userId,
        WalletAddress = address,
        Nonce = nonce,
        ExpiresAt = expiresAt,
        IsUsed = false
    });

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        walletAddress = address,
        nonce,
        message,
        expiresAt
    });
})
.RequireAuthorization();


// Verify MetaMask signature and link wallet (!)
app.MapPost("/api/wallet/verify", async (
    WalletVerifyRequest request,
    ClaimsPrincipal user,
    ApplicationDbContext db,
    WalletService walletService) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (string.IsNullOrEmpty(userId))
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(request.Nonce) ||
        string.IsNullOrWhiteSpace(request.Signature))
    {
        return Results.BadRequest(new
        {
            error = "MISSING_SIGNATURE"
        });
    }

    string address;

    try
    {
        address = walletService.NormalizeAddress(request.WalletAddress);
    }
    catch (ArgumentException)
    {
        return Results.BadRequest(new
        {
            error = "INVALID_WALLET_ADDRESS"
        });
    }

    var challenge = await db.WalletChallenges
        .AsNoTracking()
        .FirstOrDefaultAsync(c =>
            c.UserId == userId &&
            c.WalletAddress == address &&
            c.Nonce == request.Nonce);

    if (challenge == null ||
        challenge.IsUsed ||
        challenge.ExpiresAt <= DateTime.UtcNow)
    {
        return Results.BadRequest(new
        {
            error = "INVALID_OR_EXPIRED_CHALLENGE"
        });
    }

    DateTime expiresAtUtc = DateTime.SpecifyKind(
        challenge.ExpiresAt, DateTimeKind.Utc
    );

    string message = walletService.CreateMessage(
        challenge.UserId, challenge.WalletAddress,
        challenge.Nonce, expiresAtUtc);


bool validSignature = walletService.VerifySignature(
    message, request.Signature, address);

if (!validSignature)
{
    return Results.BadRequest(new
    {
        error = "INVALID_SIGNATURE"
    });
}

    // Consume the challenge atomically.
    int consumed = await db.WalletChallenges
        .Where(c => c.Id == challenge.Id &&
                    !c.IsUsed &&
                    c.ExpiresAt > DateTime.UtcNow)
        .ExecuteUpdateAsync(s =>
            s.SetProperty(c => c.IsUsed, true));

    if (consumed != 1)
    {
        return Results.BadRequest(new
        {
            error = "CHALLENGE_ALREADY_USED"
        });
    }

    // One wallet per user, one user per wallet.
    var existing = await db.UserWallets
        .FirstOrDefaultAsync(w => w.UserId == userId);

    if (existing != null)
    {
        if (existing.WalletAddress != address)
        {
            return Results.Conflict(new
            {
                error = "USER_ALREADY_HAS_WALLET"
            });
        }

        return Results.Ok(new
        {
            linked = true,
            walletAddress = address
        });
    }

    db.UserWallets.Add(new UserWallet
    {
        UserId = userId,
        WalletAddress = address,
        LinkedAt = DateTime.UtcNow
    });

    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        // Unique indexes prevent duplicate wallet ownership.
        return Results.Conflict(new
        {
            error = "WALLET_LINK_CONFLICT"
        });
    }

    return Results.Ok(new
    {
        linked = true,
        walletAddress = address
    });
})
.RequireAuthorization();


// Get linked wallet for the current user
app.MapGet("/api/wallet/status", async (
    ClaimsPrincipal user,
    ApplicationDbContext db,
    SubscriptionService subscriptionService) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (string.IsNullOrEmpty(userId))
        return Results.Unauthorized();

    var wallet = await db.UserWallets
        .AsNoTracking()
        .FirstOrDefaultAsync(w => w.UserId == userId);

    if (wallet == null)
    {
        return Results.Ok(new
        {
            linked = false,
            walletAddress = (string?)null,
            subscriptionActive = false
        });
    }

    try
    {
        bool active = await subscriptionService.IsSubscribedAsync(
            wallet.WalletAddress);

        return Results.Ok(new
        {
            linked = true,
            walletAddress = wallet.WalletAddress,
            subscriptionActive = active
        });
    }
    catch (Exception)
    {
        return Results.Json(new
        {
            error = "BLOCKCHAIN_UNAVAILABLE",
            message = "Could not verify subscription on Sepolia."
        }, statusCode: 503);
    }
})
.RequireAuthorization();



// Public configuration needed by the Web App to send Sepolia transactions.
// RPC API keys and private keys are never exposed to the browser.
app.MapGet("/api/wallet/config", (IConfiguration config) =>
{
    var contractAddress = config["BIRD_CONTRACT_ADDRESS"];

    if (string.IsNullOrWhiteSpace(contractAddress))
    {
        return Results.Json(new { error = "CONTRACT_NOT_CONFIGURED" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    return Results.Ok(new
    {
        chainId = "0xaa36a7", // Ethereum Sepolia (11155111)
        contractAddress,
        subscriptionPriceWei = "1000000000000000" // 0.001 test ETH
    });
});


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

// Account quota and current Sepolia subscription status (shared by Web and Mobile).
app.MapGet("/api/ai/quota", async (
    ClaimsPrincipal user,
    ApplicationDbContext db,
    SubscriptionService subscriptionService) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

    var quota = await db.FreeAnalysisQuotas.AsNoTracking()
        .FirstOrDefaultAsync(q => q.UserId == userId);

    const int freeLimit = 5;
    var used = quota?.UsedAttempts ?? 0;
    var reserved = quota?.ReservedAttempts ?? 0;

    var wallet = await db.UserWallets.AsNoTracking()
        .FirstOrDefaultAsync(w => w.UserId == userId);

    bool subscriptionActive = false;
    if (wallet != null)
    {
        try
        {
            subscriptionActive = await subscriptionService
                .IsSubscribedAsync(wallet.WalletAddress);
        }
        catch (Exception)
        {
            return Results.Json(new { error = "BLOCKCHAIN_UNAVAILABLE" },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    return Results.Ok(new
    {
        freeLimit,
        usedAttempts = used,
        remainingAttempts = Math.Max(0, freeLimit - used - reserved),
        reservedAttempts = reserved,
        subscriptionActive
    });
})
.RequireAuthorization();

// Both types of analysis use the same server-side account limit.

app.MapPost("/api/ai/analyze/image", async (
    IFormFile file,
    ClaimsPrincipal user,
    ApplicationDbContext db,
    IHttpClientFactory factory,
    SubscriptionService subscriptionService) =>
    await AnalyzeWithQuota(
        file, user, db, factory, subscriptionService,
        "/api/analyze/image", 12 * 1024 * 1024))
.DisableAntiforgery()
.RequireAuthorization();

app.MapPost("/api/ai/analyze/audio", async (
    IFormFile file,
    ClaimsPrincipal user,
    ApplicationDbContext db,
    IHttpClientFactory factory,
    SubscriptionService subscriptionService) =>
    await AnalyzeWithQuota(
        file, user, db, factory, subscriptionService,
        "/api/analyze/audio", 20 * 1024 * 1024))
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

// Subscribers do not consume free attempts. Other users share five attempts.
// A successful HTTP response consumes one free attempt; failures release it.
static async Task<IResult> AnalyzeWithQuota(
    IFormFile file,
    ClaimsPrincipal user,
    ApplicationDbContext db,
    IHttpClientFactory factory,
    SubscriptionService subscriptionService,
    string aiEndpoint,
    int maxFileSize)
{
    if (file.Length == 0)
        return Results.BadRequest("File is empty.");

    if (file.Length > maxFileSize)
        return Results.StatusCode(413);

    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrEmpty(userId))
        return Results.Unauthorized();

    // Read the linked wallet from the account database.
    var wallet = await db.UserWallets.AsNoTracking()
        .FirstOrDefaultAsync(w => w.UserId == userId);

    bool subscriptionActive = false;
    if (wallet != null)
    {
        try
        {
            subscriptionActive = await subscriptionService
                .IsSubscribedAsync(wallet.WalletAddress);
        }
        catch (Exception)
        {
            // Never silently bypass the quota when the blockchain is unavailable.
            return Results.Json(new { error = "BLOCKCHAIN_UNAVAILABLE" },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    bool freeAttemptReserved = !subscriptionActive;

    if (freeAttemptReserved)
    {
        // Preserve the existing atomic SQLite quota mechanism.
        await db.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT OR IGNORE INTO FreeAnalysisQuotas (UserId, UsedAttempts, ReservedAttempts)
            VALUES ({userId}, 0, 0);
        ");

        var reserved = await db.Database.ExecuteSqlInterpolatedAsync($@"
            UPDATE FreeAnalysisQuotas
            SET ReservedAttempts = ReservedAttempts + 1
            WHERE UserId = {userId} AND UsedAttempts + ReservedAttempts < 5;
        ");

        if (reserved == 0)
            return Results.Json(new
            {
                error = "FREE_LIMIT_REACHED",
                message = "The five free analyses have been used. A subscription is required.",
                freeLimit = 5
            }, statusCode: StatusCodes.Status403Forbidden);
    }

    bool committed = false;

    try
    {
        var client = factory.CreateClient("AI_Server");
        using var form = new MultipartFormDataContent();
        using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);

        content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

        // ASCII name avoids encoding issues in the Python AI Server.
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        form.Add(content, "file", "upload" + extension);

        var response = await client.PostAsync(aiEndpoint, form);
        using (response)
        {
            var result = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode && freeAttemptReserved)
            {
                await db.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE FreeAnalysisQuotas
                    SET ReservedAttempts = ReservedAttempts - 1,
                        UsedAttempts = UsedAttempts + 1
                    WHERE UserId = {userId} AND ReservedAttempts > 0;
                ");
                committed = true;
            }

            return Results.Content(
                result,
                "application/json",
                statusCode: (int)response.StatusCode);
        }
    }
    catch (HttpRequestException)
    {
        return Results.StatusCode(503);
    }
    catch (TaskCanceledException)
    {
        return Results.StatusCode(504);
    }
    finally
    {
        if (freeAttemptReserved && !committed)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE FreeAnalysisQuotas
                SET ReservedAttempts = ReservedAttempts - 1
                WHERE UserId = {userId} AND ReservedAttempts > 0;
            ");
        }
    }
}

record RabbitMessageRequest(string Message);
