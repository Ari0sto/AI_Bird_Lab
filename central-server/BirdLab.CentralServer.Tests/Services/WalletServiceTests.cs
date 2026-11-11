using System;
using System.Collections.Generic;
using System.Linq;
using BirdLab.CentralServer.Services;
using Xunit;

namespace BirdLab.CentralServer.Tests.Services
{
    public class WalletServiceTests
    {
        private readonly WalletService service = new WalletService();

        [Fact]
        public void GenerateNonce_Returns64HexCharacters()
        {
            string nonce = service.GenerateNonce();

            Assert.Equal(64, nonce.Length);
            Assert.All(nonce, c => Assert.Contains(c, "0123456789ABCDEF"));
        }

        [Fact]
        public void GenerateNonce_GeneratesDifferentValues()
        {
            var values = new HashSet<string>();

            for (int i = 0; i < 100; i++)
                Assert.True(values.Add(service.GenerateNonce()));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void NormalizeAddress_RejectsMissingAddress(string? address)
        {
            Assert.Throws<ArgumentException>(() => service.NormalizeAddress(address!));
        }

        [Theory]
        [InlineData("not-an-address")]
        [InlineData("0x123")]
        [InlineData("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")]
        public void NormalizeAddress_RejectsInvalidAddress(string address)
        {
            Assert.Throws<ArgumentException>(() => service.NormalizeAddress(address));
        }

        [Fact]
        public void NormalizeAddress_TrimsAndLowercases()
        {
            const string address = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

            string result = service.NormalizeAddress("  " + address + "  ");

            Assert.Equal(address.ToLowerInvariant(), result);
        }

        [Fact]
        public void NormalizeAddress_AcceptsLowercaseAddress()
        {
            const string address = "0xabcdef1234567890abcdef1234567890abcdef12";

            Assert.Equal(address, service.NormalizeAddress(address));
        }

        [Fact]
        public void CreateMessage_ContainsAllVerificationFields()
        {
            var expiresAt = new DateTime(2026, 11, 10, 12, 30, 0, DateTimeKind.Utc);

            string message = service.CreateMessage(
                "user-123", "0xabcdef1234567890abcdef1234567890abcdef12",
                "NONCE123", expiresAt);

            Assert.Contains("AI Bird Lab Wallet Verification", message);
            Assert.Contains("User ID: user-123", message);
            Assert.Contains("Wallet: 0xabcdef1234567890abcdef1234567890abcdef12", message);
            Assert.Contains("Nonce: NONCE123", message);
            Assert.Contains($"Expires At (UTC): {expiresAt:O}", message);
            Assert.Contains("This signature does not authorize a payment.", message);
        }

        [Fact]
        public void CreateMessage_IsDeterministic()
        {
            var expiresAt = new DateTime(2026, 11, 10, 12, 30, 0, DateTimeKind.Utc);

            string first = service.CreateMessage("user-1", "wallet-1", "nonce-1", expiresAt);
            string second = service.CreateMessage("user-1", "wallet-1", "nonce-1", expiresAt);

            Assert.Equal(first, second);
        }

        [Fact]
        public void CreateMessage_ChangesWhenNonceChanges()
        {
            var expiresAt = DateTime.UtcNow;

            string first = service.CreateMessage("user-1", "wallet-1", "nonce-1", expiresAt);
            string second = service.CreateMessage("user-1", "wallet-1", "nonce-2", expiresAt);

            Assert.NotEqual(first, second);
        }

        [Fact]
        public void VerifySignature_ReturnsFalseForInvalidSignature()
        {
            bool result = service.VerifySignature(
                "Test message", "not-a-signature",
                "0xabcdef1234567890abcdef1234567890abcdef12");

            Assert.False(result);
        }

        [Fact]
        public void VerifySignature_ReturnsFalseForEmptySignature()
        {
            bool result = service.VerifySignature(
                "Test message", "",
                "0xabcdef1234567890abcdef1234567890abcdef12");

            Assert.False(result);
        }
    }
}
