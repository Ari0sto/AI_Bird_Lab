
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BirdLab.CentralServer.Data
{
    public class ApplicationDbContext : IdentityDbContext<IdentityUser>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<FreeAnalysisQuota> FreeAnalysisQuotas
            => Set<FreeAnalysisQuota>();

        public DbSet<UserWallet> UserWallets
            => Set<UserWallet>();

        public DbSet<WalletChallenge> WalletChallenges
            => Set<WalletChallenge>();

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            // Free analysis quota
            builder.Entity<FreeAnalysisQuota>()
                .HasKey(q => q.UserId);

            // One wallet per user
            builder.Entity<UserWallet>()
                .HasIndex(w => w.UserId)
                .IsUnique();

            // One user per wallet
            builder.Entity<UserWallet>()
                .HasIndex(w => w.WalletAddress)
                .IsUnique();

            // Unique verification nonce
            builder.Entity<WalletChallenge>()
                .HasIndex(c => c.Nonce)
                .IsUnique();
        }
    }
}
