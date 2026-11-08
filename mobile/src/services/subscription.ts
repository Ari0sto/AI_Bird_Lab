import { ensureOk } from './api';

type AuthFetch = (path: string, options?: RequestInit) => Promise<Response>;

export type AnalysisQuota = {
  freeLimit: number;
  usedAttempts: number;
  remainingAttempts: number;
  reservedAttempts: number;
  subscriptionActive: boolean;
};

export type WalletStatus = {
  linked: boolean;
  walletAddress: string | null;
  subscriptionActive: boolean;
};

export async function getAnalysisQuota(authFetch: AuthFetch): Promise<AnalysisQuota> {
  const response = await authFetch('/api/ai/quota');
  await ensureOk(response);
  return (await response.json()) as AnalysisQuota;
}

export async function getWalletStatus(authFetch: AuthFetch): Promise<WalletStatus> {
  const response = await authFetch('/api/wallet/status');
  await ensureOk(response);
  return (await response.json()) as WalletStatus;
}
