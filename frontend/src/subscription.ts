import type { WalletConfig } from './api';

// MetaMask uses the EIP-1193 provider injected into the browser.
// No ethers.js dependency, private keys or browser RPC API keys are required.
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function metaMask(): EthereumProvider {
  if (!window.ethereum) {
    throw new Error('MetaMask не найден. Установите расширение и откройте сайт снова.');
  }
  return window.ethereum;
}

function walletError(error: unknown): Error {
  if (typeof error === 'object' && error !== null) {
    const value = error as { code?: number; message?: string };
    if (value.code === 4001) return new Error('Операция отменена в MetaMask.');
    if (value.code === -32002) return new Error('Подтвердите уже открытый запрос MetaMask.');
    if (typeof value.message === 'string') return new Error(value.message);
  }
  return new Error('Ошибка взаимодействия с MetaMask.');
}

export async function requestWalletAddress(): Promise<string> {
  try {
    const accounts = await metaMask().request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') {
      throw new Error('MetaMask не предоставил адрес кошелька.');
    }
    return accounts[0];
  } catch (error) {
    throw walletError(error);
  }
}

export async function signWalletMessage(message: string, walletAddress: string): Promise<string> {
  try {
    // personal_sign expects the UTF-8 message encoded as a 0x-prefixed hex string.
    // The backend verifies the original human-readable message with EIP-191.
    const messageHex = '0x' + Array.from(new TextEncoder().encode(message))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    const signed = await metaMask().request({
      method: 'personal_sign',
      params: [messageHex, walletAddress],
    });
    if (typeof signed !== 'string') throw new Error('MetaMask не вернул подпись.');
    return signed;
  } catch (error) {
    throw walletError(error);
  }
}

async function switchToSepolia(chainId: string): Promise<void> {
  const wallet = metaMask();
  const current = await wallet.request({ method: 'eth_chainId' });
  if (current === chainId) return;

  try {
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (error) {
    const value = error as { code?: number } | null;
    if (value?.code === 4902) {
      throw new Error('Сеть Sepolia не добавлена в MetaMask. Включите тестовые сети и добавьте Sepolia.');
    }
    throw walletError(error);
  }
}

const SUBSCRIBE_FUNCTION_SELECTOR = '0x8f449a05';
// keccak256('subscribe()') -> 8f449a05...

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, ms));

export async function purchaseSubscription(
  config: WalletConfig,
  linkedWalletAddress: string,
  notify: (message: string) => void
): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(config.contractAddress)) {
    throw new Error('Некорректный адрес контракта в конфигурации Central Server.');
  }
  if (config.chainId !== '0xaa36a7' || config.subscriptionPriceWei !== '1000000000000000') {
    throw new Error('Неожиданная конфигурация сети или стоимости подписки.');
  }

  try {
    await switchToSepolia(config.chainId);
    const address = await requestWalletAddress();

    if (address.toLowerCase() !== linkedWalletAddress.toLowerCase()) {
      throw new Error('В MetaMask выбран другой кошелёк. Переключитесь на привязанный адрес.');
    }

    notify('Подтвердите транзакцию на 0.001 тестового ETH в MetaMask.');

    // EIP-1193 eth_sendTransaction; 0.001 ETH = 10^15 wei.
    const result = await metaMask().request({
      method: 'eth_sendTransaction',
      params: [{
        from: address,
        to: config.contractAddress,
        value: '0x38d7ea4c68000',
        data: SUBSCRIBE_FUNCTION_SELECTOR,
      }],
    });

    if (typeof result !== 'string') throw new Error('MetaMask не вернул hash транзакции.');
    const transactionHash = result;
    notify(`Транзакция отправлена (${transactionHash.slice(0, 12)}…). Ожидаем подтверждения Sepolia.`);

    // MetaMask confirms sending, not mining. Poll for a successful receipt.
    for (let attempt = 0; attempt < 90; attempt++) {
      const receipt = await metaMask().request({
        method: 'eth_getTransactionReceipt',
        params: [transactionHash],
      }) as { status?: string } | null;

      if (receipt) {
        if (receipt.status !== '0x1') {
          throw new Error('Транзакция завершилась ошибкой. Проверьте её в Sepolia Etherscan.');
        }
        return transactionHash;
      }
      await sleep(2000);
    }

    throw new Error(`Транзакция отправлена (${transactionHash.slice(0, 12)}…), но подтверждение пока не получено. Обновите статус позже.`);
  } catch (error) {
    throw walletError(error);
  }
}
