namespace BirdLab.CentralServer.Data;

public class FreeAnalysisQuota
{
    public string UserId { get; set; } = string.Empty;
    public int UsedAttempts { get; set; }
    public int ReservedAttempts { get; set; }
}
