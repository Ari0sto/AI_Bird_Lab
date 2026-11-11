using BirdLab.CentralServer.Services;
using Microsoft.Extensions.Configuration;

namespace BirdLab.CentralServer.Tests.Services;

public class SubscriptionServiceTests
{
    private static IConfiguration Config(string? rpc, string? contract)
    {
        return new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["SEPOLIA_RPC_URL"] = rpc,
                ["BIRD_CONTRACT_ADDRESS"] = contract
            }).Build();
    }

    [Fact]
    public void MissingRpcUrl_FailsFast()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            new SubscriptionService(Config(null, "0x0000000000000000000000000000000000000001")));
        Assert.Contains("SEPOLIA_RPC_URL", ex.Message);
    }

    [Fact]
    public void MissingContractAddress_FailsFast()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            new SubscriptionService(Config("http://localhost:1", null)));
        Assert.Contains("BIRD_CONTRACT_ADDRESS", ex.Message);
    }

    [Fact]
    public void ConfiguredService_CanBeConstructedWithoutBlockchain()
    {
        var service = new SubscriptionService(Config("http://127.0.0.1:8545", "0x0000000000000000000000000000000000000001"));
        Assert.NotNull(service);
    }
}
