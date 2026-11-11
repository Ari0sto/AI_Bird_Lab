import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockRefresh = jest.fn();
const mockApiRequest = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItem(...args),
  setItemAsync: (...args: unknown[]) => mockSetItem(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItem(...args),
}));
jest.mock('../src/services/auth', () => ({
  loginUser: (...args: unknown[]) => mockLogin(...args),
  registerUser: (...args: unknown[]) => mockRegister(...args),
  refreshUser: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('../src/services/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const TOKENS = {
  accessToken: 'token-1', refreshToken: 'refresh-1', expiresIn: 3600, tokenType: 'Bearer',
};

async function context() {
  const hook = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  mockGetItem.mockReset().mockResolvedValue(null);
  mockSetItem.mockReset().mockResolvedValue(undefined);
  mockDeleteItem.mockReset().mockResolvedValue(undefined);
  mockLogin.mockReset().mockResolvedValue(TOKENS);
  mockRegister.mockReset().mockResolvedValue(undefined);
  mockRefresh.mockReset().mockResolvedValue({ ...TOKENS, accessToken: 'token-2' });
  mockApiRequest.mockReset().mockResolvedValue({ status: 200, ok: true });
});

describe('Mobile AuthContext session lifecycle', () => {
  it('starts logged out when secure storage is empty', async () => {
    const { result } = await context();
    expect(result.current.session).toBeNull();
    expect(mockGetItem).toHaveBeenCalledWith('birdlab_session');
  });

  it('signIn trims email and persists the session', async () => {
    const { result } = await context();
    await act(async () => { await result.current.signIn('  user@example.test  ', 'pass'); });
    expect(mockLogin).toHaveBeenCalledWith('user@example.test', 'pass');
    expect(result.current.session?.email).toBe('user@example.test');
    const stored = JSON.parse(mockSetItem.mock.calls[0][1]);
    expect(stored.accessToken).toBe('token-1');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it('signUp registers and then signs the user in', async () => {
    const { result } = await context();
    await act(async () => { await result.current.signUp(' user@example.test ', 'pass'); });
    expect(mockRegister).toHaveBeenCalledWith('user@example.test', 'pass');
    expect(mockLogin).toHaveBeenCalledWith('user@example.test', 'pass');
    expect(result.current.session?.email).toBe('user@example.test');
  });

  it('does not permit authenticated fetch without a session', async () => {
    const { result } = await context();
    await expect(result.current.authenticatedFetch('/api/ai/quota'))
      .rejects.toThrow('Please sign in first');
  });

  it('attaches the active bearer token to API requests', async () => {
    const { result } = await context();
    await act(async () => { await result.current.signIn('user@example.test', 'pass'); });
    await result.current.authenticatedFetch('/api/ai/quota');
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/ai/quota');
    const headers = mockApiRequest.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('refreshes after HTTP 401 and retries with the new token', async () => {
    const { result } = await context();
    await act(async () => { await result.current.signIn('user@example.test', 'pass'); });
    mockApiRequest.mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 });
    // Token refresh calls setSession asynchronously: keep that update inside act.
    let status = 0;
    await act(async () => {
      const response = await result.current.authenticatedFetch('/api/ai/stats');
      status = response.status;
    });
    expect(status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledWith('refresh-1');
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
    expect(mockApiRequest.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer token-2');
  });

  it('signOut clears both memory and secure storage', async () => {
    const { result } = await context();
    await act(async () => { await result.current.signIn('user@example.test', 'pass'); });
    await act(async () => { await result.current.signOut(); });
    expect(result.current.session).toBeNull();
    expect(mockDeleteItem).toHaveBeenCalledWith('birdlab_session');
  });

  it('restores a valid saved session', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({
      email: 'saved@example.test', accessToken: 'saved-access', refreshToken: 'saved-refresh',
      expiresAt: Date.now() + 600_000,
    }));
    const { result } = await context();
    expect(result.current.session?.email).toBe('saved@example.test');
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('rejects and deletes invalid saved data', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({ email: 'broken' }));
    const { result } = await context();
    expect(result.current.session).toBeNull();
    expect(mockDeleteItem).toHaveBeenCalledWith('birdlab_session');
  });
});
