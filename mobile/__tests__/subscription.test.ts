const mockEnsureOk = jest.fn();
jest.mock('../src/services/api', () => ({ ensureOk: (...args: unknown[]) => mockEnsureOk(...args) }));
import { getAnalysisQuota, getWalletStatus } from '../src/services/subscription';

const authFetch = jest.fn();
beforeEach(() => {
  authFetch.mockReset();
  mockEnsureOk.mockReset();
});

describe('Mobile quota and wallet status', () => {
  it('loads the free attempt counter using authenticated fetch', async () => {
    const quota = { freeLimit: 5, usedAttempts: 3, remainingAttempts: 2, reservedAttempts: 0, subscriptionActive: false };
    authFetch.mockResolvedValue({ ok: true, json: async () => quota });
    expect(await getAnalysisQuota(authFetch)).toEqual(quota);
    expect(authFetch).toHaveBeenCalledWith('/api/ai/quota');
  });

  it('loads the linked wallet and subscription status', async () => {
    const wallet = { linked: true, walletAddress: '0xabc', subscriptionActive: true };
    authFetch.mockResolvedValue({ ok: true, json: async () => wallet });
    expect(await getWalletStatus(authFetch)).toEqual(wallet);
    expect(authFetch).toHaveBeenCalledWith('/api/wallet/status');
  });

  it('propagates validation errors before reading response', async () => {
    authFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    mockEnsureOk.mockRejectedValue(new Error('HTTP 503'));
    await expect(getAnalysisQuota(authFetch)).rejects.toThrow('HTTP 503');
  });
});
