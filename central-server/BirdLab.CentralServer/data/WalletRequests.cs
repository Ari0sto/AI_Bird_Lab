
namespace BirdLab.CentralServer.Data
{
    public record WalletChallengeRequest(string WalletAddress);

    public record WalletVerifyRequest(
        string WalletAddress,
        string Nonce,
        string Signature
    );
}
