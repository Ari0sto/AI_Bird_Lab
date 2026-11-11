import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWalletChallenge, exportCsv, fetchHistory, fetchQuota, fetchStats,
  fetchWalletConfig, fetchWalletStatus, login, logout, recognize, register,
  removeHistory, setAccessToken, verifyWalletSignature,
} from '../api';

function response(body: unknown, status = 200): Response {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => serialized,
    json: async () => JSON.parse(serialized),
    blob: async () => new Blob([serialized]),
  } as Response;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  setAccessToken(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  logout();
  vi.unstubAllGlobals();
});

describe('Web API / authentication', () => {
  it('posts login credentials and stores bearer token for subsequent requests', async () => {
    fetchMock.mockResolvedValueOnce(response({ accessToken: 'abc', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 3600 }));
    await login('bird@example.test', 'password');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/auth/login?useCookies=false');
    expect(JSON.parse(init!.body as string)).toEqual({ email: 'bird@example.test', password: 'password' });
    fetchMock.mockResolvedValueOnce(response({ total: 7 }));
    await fetchStats();
    const headers = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });

  it('logout removes the bearer token', async () => {
    setAccessToken('temporary');
    logout();
    fetchMock.mockResolvedValue(response({ total: 0 }));
    await fetchStats();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
  });

  it('posts registration JSON', async () => {
    fetchMock.mockResolvedValue(response('', 200));
    await register('new@example.test', 'Secure123!');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/auth/register');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).email).toBe('new@example.test');
  });

  it('rejects an HTTP 401 as missing authentication', async () => {
    fetchMock.mockResolvedValue(response({ message: 'ignored' }, 401));
    await expect(fetchStats()).rejects.toThrow('Необходима авторизация');
  });

  it('translates the free analysis limit error', async () => {
    fetchMock.mockResolvedValue(response({ error: 'FREE_LIMIT_REACHED' }, 403));
    await expect(fetchQuota()).rejects.toThrow('Пять бесплатных анализов');
  });

  it('translates blockchain RPC unavailability', async () => {
    fetchMock.mockResolvedValue(response({ error: 'BLOCKCHAIN_UNAVAILABLE' }, 503));
    await expect(fetchWalletStatus()).rejects.toThrow('Sepolia RPC');
  });

  it('supports ASP.NET errors with message and FastAPI detail arrays', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: 'Custom error' }, 400));
    await expect(fetchStats()).rejects.toThrow('Custom error');
    fetchMock.mockResolvedValueOnce(response({ detail: [{ msg: 'bad image' }, { msg: 'bad audio' }] }, 422));
    await expect(fetchStats()).rejects.toThrow('bad image; bad audio');
  });

  it('retains status details for non-JSON failures', async () => {
    fetchMock.mockResolvedValue(response('not-json', 502));
    await expect(fetchStats()).rejects.toThrow('Ошибка сервера (502)');
  });

  it('converts network exceptions into a useful connection error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchStats()).rejects.toThrow('Не удалось подключиться к Central Server');
  });
});

describe('Web API / analysis and history', () => {
  it('uploads the file as multipart form data', async () => {
    fetchMock.mockResolvedValue(response({ id: 3, media_type: 'image', filename: 'bird.png', predictions: [] }));
    const file = new File(['image-data'], 'bird.png', { type: 'image/png' });
    await recognize(file, 'image');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/ai/analyze/image');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBe(file);
  });

  it('escapes search input rather than concatenating raw query text', async () => {
    fetchMock.mockResolvedValue(response([]));
    await fetchHistory('blue jay & raven');
    expect(fetchMock.mock.calls[0][0]).toContain('search=blue%20jay%20%26%20raven');
  });

  it('deletes the requested history record', async () => {
    fetchMock.mockResolvedValue(response({ deleted: true }));
    expect(await removeHistory(12)).toEqual({ deleted: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/api/ai/history/12');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('returns statistics and wallet configuration', async () => {
    fetchMock.mockResolvedValueOnce(response({ total: 8 }));
    expect((await fetchStats()).total).toBe(8);
    fetchMock.mockResolvedValueOnce(response({ chainId: '0xaa36a7', subscriptionPriceWei: '1000000000000000' }));
    expect((await fetchWalletConfig()).chainId).toBe('0xaa36a7');
  });

  it('does not export CSV without authentication', async () => {
    await expect(exportCsv()).rejects.toThrow('Необходима авторизация');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exports CSV as a blob with an authorized request', async () => {
    setAccessToken('csv-token');
    fetchMock.mockResolvedValue(response('id,species\n1,Raven'));
    const blob = await exportCsv();
    expect(blob).toBeInstanceOf(Blob);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer csv-token');
  });

  it('creates and verifies wallet challenges using JSON payloads', async () => {
    fetchMock.mockResolvedValueOnce(response({ walletAddress: '0x123', nonce: 'nonce', message: 'sign me', expiresAt: 'tomorrow' }));
    await createWalletChallenge('0x123');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ walletAddress: '0x123' });
    fetchMock.mockResolvedValueOnce(response({ linked: true, walletAddress: '0x123' }));
    expect((await verifyWalletSignature('0x123', 'nonce', 'signature')).linked).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      walletAddress: '0x123', nonce: 'nonce', signature: 'signature',
    });
  });
});
