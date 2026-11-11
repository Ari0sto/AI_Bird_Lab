using BirdLab.CentralServer.Services;
using Nethereum.Signer;

namespace BirdLab.CentralServer.Tests.Services;

public class WalletCryptoTests
{
    private readonly WalletService _wallet = new();

    [Fact]
    public void ValidPersonalSign_RecoversTheCorrectAddress()
    {
        var key = EthECKey.GenerateKey();
        var message = "BirdLab challenge / nonce 012345";
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign(message, key);

        Assert.True(_wallet.VerifySignature(message, signature, key.GetPublicAddress()));
    }

    [Fact]
    public void SignatureFromAnotherWallet_IsRejected()
    {
        var signer = EthECKey.GenerateKey();
        var anotherWallet = EthECKey.GenerateKey();
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign("challenge", signer);

        Assert.False(_wallet.VerifySignature("challenge", signature, anotherWallet.GetPublicAddress()));
    }

    [Fact]
    public void SignatureForDifferentChallenge_IsRejected()
    {
        var key = EthECKey.GenerateKey();
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign("nonce-A", key);

        Assert.False(_wallet.VerifySignature("nonce-B", signature, key.GetPublicAddress()));
    }

    [Fact]
    public void SignatureWithUppercaseAddress_IsAccepted()
    {
        var key = EthECKey.GenerateKey();
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign("challenge", key);
        Assert.True(_wallet.VerifySignature("challenge", signature, key.GetPublicAddress().ToUpperInvariant().Replace("0X", "0x")));
    }
}
