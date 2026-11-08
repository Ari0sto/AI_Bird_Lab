
using System.Security.Cryptography;
using Nethereum.Signer;
using Nethereum.Util;

namespace BirdLab.CentralServer.Services
{
    public class WalletService
    {
        // Generate a cryptographically secure random nonce
        public string GenerateNonce()
        {
            byte[] bytes = RandomNumberGenerator.GetBytes(32);

            return Convert.ToHexString(bytes);
        }

        // Normalize Ethereum wallet address
        public string NormalizeAddress(string address)
        {
            if (string.IsNullOrWhiteSpace(address))
            {
                throw new ArgumentException("Wallet address is required.");
            }

            address = address.Trim();

            if (!AddressUtil.Current.IsValidEthereumAddressHexFormat(address))
            {
                throw new ArgumentException("Invalid Ethereum wallet address.");
            }

            return address.ToLowerInvariant();
        }

        // Create the exact message that MetaMask must sign
        public string CreateMessage(
            string userId,
            string walletAddress,
            string nonce,
            DateTime expiresAt)
        {
            return
                "AI Bird Lab Wallet Verification\n" +
                "Purpose: Link an Ethereum wallet to your AI Bird Lab account.\n" +
                $"User ID: {userId}\n" +
                $"Wallet: {walletAddress}\n" +
                $"Nonce: {nonce}\n" +
                $"Expires At (UTC): {expiresAt:O}\n" +
                "This signature does not authorize a payment.";
        }

        // Verify an Ethereum personal_sign signature
        public bool VerifySignature(
            string message,
            string signature,
            string expectedAddress)
        {
            try
            {
                var signer = new EthereumMessageSigner();

                string recoveredAddress =
                    signer.EncodeUTF8AndEcRecover(message, signature);

                return string.Equals(
                    NormalizeAddress(recoveredAddress),
                    NormalizeAddress(expectedAddress),
                    StringComparison.Ordinal);
            }
            catch
            {
                return false;
            }
        }
    }
}
