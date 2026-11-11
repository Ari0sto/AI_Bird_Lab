namespace BirdLab.CentralServer.Data;

public class WalletChallenge
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string WalletAddress { get; set; } = string.Empty;

    public string Nonce { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }

    public bool IsUsed { get; set; } = false;
}