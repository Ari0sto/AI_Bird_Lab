using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Nethereum.Signer;

namespace BirdLab.CentralServer.Tests.Api;

public class ApiIntegrationTests
{
    private static async Task<string> RegisterAndLoginAsync(HttpClient client)
    {
        var email = $"user-{Guid.NewGuid():N}@example.test";
        var password = "StrongPass123!";
        var registered = await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login?useCookies=false", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var json = await login.Content.ReadFromJsonAsync<JsonElement>();
        var token = json.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrEmpty(token));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return email;
    }

    private static MultipartFormDataContent ImageUpload()
    {
        var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(new byte[] { 1, 2, 3, 4 }), "file", "bird.jpg");
        return form;
    }

    [Fact]
    public async Task Health_ReturnsOkWithoutLogin()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Central Server is running", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/api/user/me")]
    [InlineData("/api/ai/quota")]
    [InlineData("/api/ai/history")]
    [InlineData("/api/ai/stats")]
    [InlineData("/api/ai/export")]
    [InlineData("/api/wallet/status")]
    public async Task ProtectedGet_RejectsAnonymousRequests(string path)
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task WalletConfig_IsPublicAndUsesSepolia()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/wallet/config");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var config = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("0xaa36a7", config.GetProperty("chainId").GetString());
        Assert.Equal("1000000000000000", config.GetProperty("subscriptionPriceWei").GetString());
    }

    [Fact]
    public async Task LoginAndMe_ReturnOwnIdentity()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        var email = await RegisterAndLoginAsync(client);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/user/me");
        Assert.Equal(email, me.GetProperty("email").GetString());
        Assert.False(string.IsNullOrEmpty(me.GetProperty("id").GetString()));
    }

    [Fact]
    public async Task QuotaStartsAtFive_AndWalletIsNotLinked()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var quota = await client.GetFromJsonAsync<JsonElement>("/api/ai/quota");
        Assert.Equal(5, quota.GetProperty("freeLimit").GetInt32());
        Assert.Equal(5, quota.GetProperty("remainingAttempts").GetInt32());
        Assert.Equal(0, quota.GetProperty("usedAttempts").GetInt32());
        Assert.False(quota.GetProperty("subscriptionActive").GetBoolean());
        var wallet = await client.GetFromJsonAsync<JsonElement>("/api/wallet/status");
        Assert.False(wallet.GetProperty("linked").GetBoolean());
    }

    [Fact]
    public async Task FiveSuccessfulAnalyses_ConsumeFiveAttemptsAcrossMediaTypes()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        for (var i = 0; i < 5; i++)
        {
            using var upload = ImageUpload();
            var type = i % 2 == 0 ? "image" : "audio";
            var response = await client.PostAsync($"/api/ai/analyze/{type}", upload);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        var quota = await client.GetFromJsonAsync<JsonElement>("/api/ai/quota");
        Assert.Equal(5, quota.GetProperty("usedAttempts").GetInt32());
        Assert.Equal(0, quota.GetProperty("remainingAttempts").GetInt32());
        Assert.Equal(0, quota.GetProperty("reservedAttempts").GetInt32());

        using var lastUpload = ImageUpload();
        var rejected = await client.PostAsync("/api/ai/analyze/image", lastUpload);
        Assert.Equal(HttpStatusCode.Forbidden, rejected.StatusCode);
        Assert.Contains("FREE_LIMIT_REACHED", await rejected.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task FailedAiAnalysis_ReleasesReservedQuota()
    {
        using var factory = new TestAppFactory();
        factory.Ai.Respond = _ => new HttpResponseMessage(HttpStatusCode.BadGateway)
        {
            Content = new StringContent("{\"detail\":\"failed\"}")
        };
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        using var upload = ImageUpload();
        Assert.Equal(HttpStatusCode.BadGateway,
            (await client.PostAsync("/api/ai/analyze/image", upload)).StatusCode);
        var quota = await client.GetFromJsonAsync<JsonElement>("/api/ai/quota");
        Assert.Equal(5, quota.GetProperty("remainingAttempts").GetInt32());
        Assert.Equal(0, quota.GetProperty("reservedAttempts").GetInt32());
        Assert.Equal(0, quota.GetProperty("usedAttempts").GetInt32());
    }

    [Fact]
    public async Task EmptyAnalysisFile_IsRejectedWithoutConsumingQuota()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(Array.Empty<byte>()), "file", "empty.jpg");
        var response = await client.PostAsync("/api/ai/analyze/image", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var quota = await client.GetFromJsonAsync<JsonElement>("/api/ai/quota");
        Assert.Equal(5, quota.GetProperty("remainingAttempts").GetInt32());
    }

    [Fact]
    public async Task HistorySearchIsEscaped_AndDeleteIsProxied()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/ai/history?search=blue%20jay")).StatusCode);
        Assert.Equal("/api/history?search=blue%20jay", factory.Ai.LastPathAndQuery);
        Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync("/api/ai/history/7")).StatusCode);
        Assert.Equal("/api/history/7", factory.Ai.LastPathAndQuery);
        Assert.Equal("DELETE", factory.Ai.LastHttpMethod);
    }

    [Fact]
    public async Task HistorySearchAbove150Characters_IsRejected()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var response = await client.GetAsync("/api/ai/history?search=" + new string('a', 151));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AiHealth_ProxiesToPythonServer()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/ai/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("/api/health", factory.Ai.LastPathAndQuery);
    }

    [Fact]
    public async Task CsvExport_UsesCorrectDownloadFilename()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var response = await client.GetAsync("/api/ai/export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("bird_analysis.csv", response.Content.Headers.ContentDisposition?.ToString() ?? "");
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public async Task RabbitMqRejectsEmptyMessageWithoutBroker(string message)
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var response = await client.PostAsJsonAsync("/api/rabbitmq/send", new { message });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task WalletChallengeRejectsInvalidAddress()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var response = await client.PostAsJsonAsync("/api/wallet/challenge", new { walletAddress = "invalid" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("INVALID_WALLET_ADDRESS", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ChallengeCanBeCreated_ButInvalidSignatureIsRejected()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        const string address = "0xabcdef1234567890abcdef1234567890abcdef12";
        var challengeResponse = await client.PostAsJsonAsync("/api/wallet/challenge", new { walletAddress = address });
        Assert.Equal(HttpStatusCode.OK, challengeResponse.StatusCode);
        var challenge = await challengeResponse.Content.ReadFromJsonAsync<JsonElement>();
        var nonce = challenge.GetProperty("nonce").GetString();
        Assert.Contains("Wallet: " + address, challenge.GetProperty("message").GetString());
        Assert.False(string.IsNullOrEmpty(nonce));
        var verifyResponse = await client.PostAsJsonAsync("/api/wallet/verify", new {
            walletAddress = address, nonce, signature = "invalid" });
        Assert.Equal(HttpStatusCode.BadRequest, verifyResponse.StatusCode);
        Assert.Contains("INVALID_SIGNATURE", await verifyResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ValidWalletSignatureLinksWallet_AndChallengeCannotBeReplayed()
    {
        using var factory = new TestAppFactory();
        using var client = factory.CreateClient();
        await RegisterAndLoginAsync(client);
        var key = EthECKey.GenerateKey();
        var address = key.GetPublicAddress();
        var issue = await client.PostAsJsonAsync("/api/wallet/challenge", new { walletAddress = address });
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);
        var challenge = await issue.Content.ReadFromJsonAsync<JsonElement>();
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign(
            challenge.GetProperty("message").GetString()!, key);
        var request = new
        {
            walletAddress = address,
            nonce = challenge.GetProperty("nonce").GetString(),
            signature
        };
        var first = await client.PostAsJsonAsync("/api/wallet/verify", request);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var second = await client.PostAsJsonAsync("/api/wallet/verify", request);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        Assert.Contains("INVALID_OR_EXPIRED_CHALLENGE", await second.Content.ReadAsStringAsync());
    }

}
