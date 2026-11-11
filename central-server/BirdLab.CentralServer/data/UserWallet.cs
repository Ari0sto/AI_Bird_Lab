namespace BirdLab.CentralServer.Data;

public class UserWallet
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string WalletAddress { get; set; } = string.Empty;

    public DateTime LinkedAt { get; set; } = DateTime.UtcNow;
}