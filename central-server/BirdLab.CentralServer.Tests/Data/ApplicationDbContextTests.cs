using BirdLab.CentralServer.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BirdLab.CentralServer.Tests.Data;

public class ApplicationDbContextTests
{
    private static (SqliteConnection Connection, ApplicationDbContext Db) CreateDatabase()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection).Options;
        var db = new ApplicationDbContext(options);
        db.Database.EnsureCreated();
        return (connection, db);
    }

    [Fact]
    public async Task OneUserCannotLinkTwoWallets()
    {
        var (connection, db) = CreateDatabase();
        using (connection)
        await using (db)
        {
            db.UserWallets.Add(new UserWallet { UserId = "alice", WalletAddress = "0x01" });
            await db.SaveChangesAsync();
            db.UserWallets.Add(new UserWallet { UserId = "alice", WalletAddress = "0x02" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task OneWalletCannotBelongToTwoUsers()
    {
        var (connection, db) = CreateDatabase();
        using (connection)
        await using (db)
        {
            db.UserWallets.Add(new UserWallet { UserId = "alice", WalletAddress = "0x01" });
            await db.SaveChangesAsync();
            db.UserWallets.Add(new UserWallet { UserId = "bob", WalletAddress = "0x01" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task ChallengeNonceMustBeUnique()
    {
        var (connection, db) = CreateDatabase();
        using (connection)
        await using (db)
        {
            db.WalletChallenges.Add(new WalletChallenge { UserId = "alice", WalletAddress = "0x01", Nonce = "same" });
            await db.SaveChangesAsync();
            db.WalletChallenges.Add(new WalletChallenge { UserId = "bob", WalletAddress = "0x02", Nonce = "same" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task QuotasHaveOneRowPerUser_AndTrackReservedAndUsed()
    {
        var (connection, db) = CreateDatabase();
        using (connection)
        await using (db)
        {
            db.FreeAnalysisQuotas.Add(new FreeAnalysisQuota { UserId = "alice", ReservedAttempts = 2, UsedAttempts = 1 });
            await db.SaveChangesAsync();
            var quota = await db.FreeAnalysisQuotas.SingleAsync(q => q.UserId == "alice");
            Assert.Equal(2, quota.ReservedAttempts);
            Assert.Equal(1, quota.UsedAttempts);

            // A different entity with the same key cannot be tracked in the same DbContext.
            // Clear tracking first so this checks SQLite's PRIMARY KEY constraint,
            // rather than EF Core's in-memory identity-map check.
            db.ChangeTracker.Clear();
            db.FreeAnalysisQuotas.Add(new FreeAnalysisQuota { UserId = "alice" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task AtomicQuotaReservationStopsAfterFive()
    {
        var (connection, db) = CreateDatabase();
        using (connection)
        await using (db)
        {
            db.FreeAnalysisQuotas.Add(new FreeAnalysisQuota { UserId = "alice" });
            await db.SaveChangesAsync();
            for (var i = 0; i < 5; i++)
            {
                var rows = await db.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE FreeAnalysisQuotas SET ReservedAttempts = ReservedAttempts + 1
                    WHERE UserId = {"alice"} AND UsedAttempts + ReservedAttempts < 5;");
                Assert.Equal(1, rows);
            }
            var rejected = await db.Database.ExecuteSqlInterpolatedAsync($@"
                    UPDATE FreeAnalysisQuotas SET ReservedAttempts = ReservedAttempts + 1
                    WHERE UserId = {"alice"} AND UsedAttempts + ReservedAttempts < 5;");
            Assert.Equal(0, rejected);
            db.ChangeTracker.Clear();
            Assert.Equal(5, (await db.FreeAnalysisQuotas.SingleAsync()).ReservedAttempts);
        }
    }
}
