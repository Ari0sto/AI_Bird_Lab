import { apiRequest, ensureOk } from './api';

export type IdentityTokens = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

export async function loginUser(email: string, password: string): Promise<IdentityTokens> {
  const response = await apiRequest('/api/auth/login?useCookies=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 401) throw new Error('Invalid email or password.');
  await ensureOk(response);
  const data = (await response.json()) as IdentityTokens;
  if (!data.accessToken || !data.refreshToken || !(data.expiresIn > 0)) {
    throw new Error('Server returned an incomplete login response.');
  }
  return data;
}

export async function registerUser(email: string, password: string): Promise<void> {
  const response = await apiRequest('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  await ensureOk(response);
}

export async function refreshUser(refreshToken: string): Promise<IdentityTokens> {
  const response = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  await ensureOk(response);
  const data = (await response.json()) as IdentityTokens;
  if (!data.accessToken || !data.refreshToken || !(data.expiresIn > 0)) {
    throw new Error('Server returned an incomplete refresh response.');
  }
  return data;
}
