
using Nethereum.Web3;

namespace BirdLab.CentralServer.Services
{
    public class SubscriptionService
    {
        private readonly string _rpcUrl;
        private readonly string _contractAddress;

        private const string ContractAbi = """
        [
          {
            "inputs": [
              {
                "internalType": "address",
                "name": "user",
                "type": "address"
              }
            ],
            "name": "isSubscribed",
            "outputs": [
              {
                "internalType": "bool",
                "name": "",
                "type": "bool"
              }
            ],
            "stateMutability": "view",
            "type": "function"
          }
        ]
        """;

        public SubscriptionService(IConfiguration configuration)
        {
            _rpcUrl = configuration["SEPOLIA_RPC_URL"]
                ?? throw new InvalidOperationException(
                    "SEPOLIA_RPC_URL is not configured.");

            _contractAddress = configuration["BIRD_CONTRACT_ADDRESS"]
                ?? throw new InvalidOperationException(
                    "BIRD_CONTRACT_ADDRESS is not configured.");
        }

        public async Task<bool> IsSubscribedAsync(string walletAddress)
        {
            var web3 = new Web3(_rpcUrl);

            var chainId = await web3.Eth.ChainId.SendRequestAsync();

            if (chainId.Value != 11155111)
                throw new InvalidOperationException(
                    "RPC is not connected to Ethereum Sepolia.");

            var contract = web3.Eth.GetContract(
                ContractAbi, _contractAddress);

            var function = contract.GetFunction("isSubscribed");

            return await function.CallAsync<bool>(walletAddress);
        }
    }
}
