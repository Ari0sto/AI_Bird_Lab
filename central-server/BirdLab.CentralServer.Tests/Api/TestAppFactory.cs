using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BirdLab.CentralServer.Tests.Api;

// Fully isolated ASP.NET server. NEVER uses central-server/BirdLab.CentralServer/auth.db.
public sealed class TestAppFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(
        Path.GetTempPath(), "birdlab-tests-" + Guid.NewGuid().ToString("N") + ".sqlite3");

    public FakeAiHandler Ai { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Resolve the original app content root without requiring a .sln file.
        builder.UseContentRoot(Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "BirdLab.CentralServer")));
        // Startup always creates tables. Point it to an individual temporary DB.
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["AUTH_DB_PATH"] = _dbPath,
                ["AI_SERVER_URL"] = "http://ai.mock",
                ["SEPOLIA_RPC_URL"] = "http://127.0.0.1:1",
                ["BIRD_CONTRACT_ADDRESS"] = "0x0000000000000000000000000000000000000001"
            }));
        builder.ConfigureTestServices(services =>
            services.AddHttpClient("AI_Server")
                .ConfigurePrimaryHttpMessageHandler(() => Ai));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            Ai.Dispose();
            foreach (var extension in new[] { "", "-wal", "-shm" })
            {
                try { File.Delete(_dbPath + extension); }
                catch (IOException) { /* Windows can briefly retain SQLite handles */ }
            }
        }
    }
}

public sealed class FakeAiHandler : HttpMessageHandler
{
    public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = request =>
    {
        var uri = request.RequestUri!;
        var payload = uri.AbsolutePath switch
        {
            "/api/analyze/image" or "/api/analyze/audio" => "{\"id\":1,\"predictions\":[]}",
            "/api/history" => "[]",
            "/api/stats" => "{\"total\":0}",
            "/api/export" => "id,species\\n1,Raven\\n",
            "/api/health" => "{\"status\":\"ok\"}",
            _ => "{}"
        };
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(payload, Encoding.UTF8,
                uri.AbsolutePath == "/api/export" ? "text/csv" : "application/json")
        };
    };

    public string? LastPathAndQuery { get; private set; }
    public string? LastHttpMethod { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastPathAndQuery = request.RequestUri?.PathAndQuery;
        LastHttpMethod = request.Method.Method;
        return Task.FromResult(Respond(request));
    }
}
