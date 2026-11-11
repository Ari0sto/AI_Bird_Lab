import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  purchaseSubscription, requestWalletAddress, signWalletMessage,
} from '../subscription';

const ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
const CONTRACT = '0x1111111111111111111111111111111111111111';
const CONFIG = {
  chainId: '0xaa36a7', contractAddress: CONTRACT,
  subscriptionPriceWei: '1000000000000000',
};
type RpcArgs = { method: string; params?: unknown[] };
let request: ReturnType<typeof vi.fn<(args: RpcArgs) => Promise<unknown>>>;

beforeEach(() => {
  request = vi.fn(async ({ method }: RpcArgs): Promise<unknown> => {
    switch (method) {
      case 'eth_requestAccounts': return [ADDRESS];
      case 'eth_chainId': return '0xaa36a7';
      // A successful EIP-1193 network switch normally resolves without a payload.
      case 'wallet_switchEthereumChain': return null;
      case 'personal_sign': return '0xsigned';
      case 'eth_sendTransaction': return '0xtransactionhash';
      case 'eth_getTransactionReceipt': return { status: '0x1' };
      default: throw new Error(`unexpected method ${method}`);
    }
  });
  Object.defineProperty(window, 'ethereum', { configurable: true, writable: true, value: { request } });
});
afterEach(() => {
  Object.defineProperty(window, 'ethereum', { configurable: true, writable: true, value: undefined });
});

describe('Web MetaMask adapter', () => {
  it('explains when MetaMask is absent', async () => {
    window.ethereum = undefined;
    await expect(requestWalletAddress()).rejects.toThrow('MetaMask не найден');
  });

  it('returns the address selected in MetaMask', async () => {
    expect(await requestWalletAddress()).toBe(ADDRESS);
    expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });

  it('rejects an empty account list', async () => {
    request.mockResolvedValue([]);
    await expect(requestWalletAddress()).rejects.toThrow('MetaMask не предоставил адрес');
  });

  it('maps MetaMask rejected transaction and pending request errors', async () => {
    request.mockRejectedValueOnce({ code: 4001 });
    await expect(requestWalletAddress()).rejects.toThrow('Операция отменена');
    request.mockRejectedValueOnce({ code: -32002 });
    await expect(requestWalletAddress()).rejects.toThrow('Подтвердите уже открытый запрос');
  });

  it('signs UTF-8 text with personal_sign rather than raw text', async () => {
    expect(await signWalletMessage('Hi! Птица', ADDRESS)).toBe('0xsigned');
    const call = request.mock.calls[0][0];
    expect(call.method).toBe('personal_sign');
    expect(call.params?.[1]).toBe(ADDRESS);
    expect(call.params?.[0]).toBe('0x' + Array.from(new TextEncoder().encode('Hi! Птица'))
      .map(byte => byte.toString(16).padStart(2, '0')).join(''));
  });

  it('requires a signature to be returned as a string', async () => {
    request.mockResolvedValueOnce(null);
    await expect(signWalletMessage('hello', ADDRESS)).rejects.toThrow('MetaMask не вернул подпись');
  });

  it('blocks an invalid contract address before any wallet call', async () => {
    await expect(purchaseSubscription({ ...CONFIG, contractAddress: 'wrong' }, ADDRESS, vi.fn()))
      .rejects.toThrow('Некорректный адрес контракта');
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks unexpected chain and price configuration', async () => {
    await expect(purchaseSubscription({ ...CONFIG, subscriptionPriceWei: '1' }, ADDRESS, vi.fn()))
      .rejects.toThrow('Неожиданная конфигурация');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not send payment from a different selected wallet', async () => {
    request.mockImplementation(async ({ method }) => method === 'eth_chainId' ? CONFIG.chainId : [ADDRESS]);
    await expect(purchaseSubscription(CONFIG, '0x2222222222222222222222222222222222222222', vi.fn()))
      .rejects.toThrow('выбран другой кошелёк');
    expect(request.mock.calls.some(([args]) => args.method === 'eth_sendTransaction')).toBe(false);
  });

  it('sends the exact value, selector and recipient only after wallet match', async () => {
    const notify = vi.fn();
    expect(await purchaseSubscription(CONFIG, ADDRESS.toUpperCase().replace('0X', '0x'), notify))
      .toBe('0xtransactionhash');
    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [{
        from: ADDRESS, to: CONTRACT, value: '0x38d7ea4c68000', data: '0x8f449a05',
      }],
    });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('switches to Sepolia if another network is selected', async () => {
    const normal = request.getMockImplementation()!;
    request.mockImplementation(async args => args.method === 'eth_chainId' ? '0x1' : normal(args));
    await purchaseSubscription(CONFIG, ADDRESS, vi.fn());
    expect(request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }],
    });
  });

  it('handles missing Sepolia network', async () => {
    const normal = request.getMockImplementation()!;
    request.mockImplementation(async args => {
      if (args.method === 'eth_chainId') return '0x1';
      if (args.method === 'wallet_switchEthereumChain') throw { code: 4902 };
      return normal(args);
    });
    await expect(purchaseSubscription(CONFIG, ADDRESS, vi.fn()))
      .rejects.toThrow('Сеть Sepolia не добавлена');
  });

  it('does not treat a reverted transaction as an active subscription', async () => {
    const normal = request.getMockImplementation()!;
    request.mockImplementation(async args => args.method === 'eth_getTransactionReceipt'
      ? { status: '0x0' } : normal(args));
    await expect(purchaseSubscription(CONFIG, ADDRESS, vi.fn()))
      .rejects.toThrow('Транзакция завершилась ошибкой');
  });
});
