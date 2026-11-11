import { ensureOk } from '../src/services/api';

const mockExpoFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));

const response = (status: number, json: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn(async () => json),
});

describe('Mobile API error handling', () => {
  it('accepts successful responses', async () => {
    await expect(ensureOk(response(204, {}) as any)).resolves.toBeUndefined();
  });

  it.each([
    [400, { detail: 'invalid input' }, 'invalid input'],
    [403, { message: 'quota exhausted' }, 'quota exhausted'],
    [404, { title: 'Not found' }, 'Not found'],
    [422, { detail: [{ msg: 'field A' }, { msg: 'field B' }] }, 'field A; field B'],
    [400, { errors: { Email: ['bad email'], Password: ['weak password'] } }, 'bad email; weak password'],
  ])('formats HTTP %s server error payloads', async (status, data, expected) => {
    await expect(ensureOk(response(status, data) as any)).rejects.toThrow(expected);
  });

  it('preserves the HTTP status when JSON parsing fails', async () => {
    await expect(ensureOk({ ok: false, status: 502, json: async () => { throw new Error('bad json'); } } as any))
      .rejects.toThrow('Server error: HTTP 502');
  });
});

describe('Mobile API transport', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExpoFetch.mockReset();
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:5000/';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it('attaches default headers and uses Central Server URL', async () => {
    const fake = { status: 200 };
    mockExpoFetch.mockResolvedValue(fake);
    const { apiRequest } = require('../src/services/api');
    const result = await apiRequest('/api/ai/quota');
    expect(result).toBe(fake);
    expect(mockExpoFetch.mock.calls[0][0]).toBe('http://127.0.0.1:5000/api/ai/quota');
    const headers = mockExpoFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('ngrok-skip-browser-warning')).toBe('1');
  });

  it('forwards authorization headers', async () => {
    mockExpoFetch.mockResolvedValue({ status: 200 });
    const { apiRequest } = require('../src/services/api');
    await apiRequest('/api/ai/stats', { headers: { Authorization: 'Bearer token' } });
    expect(mockExpoFetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer token');
  });

  it('fails clearly if mobile API URL is absent', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { apiRequest } = require('../src/services/api');
    await expect(apiRequest('/api/ai/quota')).rejects.toThrow('EXPO_PUBLIC_API_URL is missing');
    expect(mockExpoFetch).not.toHaveBeenCalled();
  });

  it('propagates network errors', async () => {
    mockExpoFetch.mockRejectedValue(new Error('connection refused'));
    const { apiRequest } = require('../src/services/api');
    await expect(apiRequest('/health')).rejects.toThrow('connection refused');
  });
});
