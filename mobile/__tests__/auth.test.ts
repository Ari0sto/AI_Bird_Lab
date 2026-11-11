const mockApiRequest = jest.fn();
const mockEnsureOk = jest.fn();
jest.mock('../src/services/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  ensureOk: (...args: unknown[]) => mockEnsureOk(...args),
}));

import { loginUser, refreshUser, registerUser } from '../src/services/auth';

const TOKENS = {
  tokenType: 'Bearer', accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600,
};
const fakeResponse = (status: number, body: unknown) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});

beforeEach(() => {
  mockApiRequest.mockReset();
  mockEnsureOk.mockReset();
});

describe('Mobile Identity API', () => {
  it('sends login credentials to Central Server', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, TOKENS));
    expect(await loginUser('one@example.test', 'pass')).toEqual(TOKENS);
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/auth/login?useCookies=false');
    expect(JSON.parse(mockApiRequest.mock.calls[0][1].body)).toEqual({ email: 'one@example.test', password: 'pass' });
  });

  it('rejects bad login credentials', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(401, {}));
    await expect(loginUser('one@example.test', 'bad')).rejects.toThrow('Invalid email or password');
  });

  it.each([
    { accessToken: '', refreshToken: 'refresh', expiresIn: 3600 },
    { accessToken: 'access', refreshToken: '', expiresIn: 3600 },
    { accessToken: 'access', refreshToken: 'refresh', expiresIn: 0 },
  ])('rejects incomplete token payloads', async tokens => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, tokens));
    await expect(loginUser('one@example.test', 'pass')).rejects.toThrow('incomplete login response');
  });

  it('registers accounts with application/json', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, {}));
    await registerUser('new@example.test', 'password');
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/auth/register');
    expect(JSON.parse(mockApiRequest.mock.calls[0][1].body).email).toBe('new@example.test');
  });

  it('refreshes using the refresh token', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, TOKENS));
    expect(await refreshUser('old-refresh')).toEqual(TOKENS);
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/auth/refresh');
    expect(JSON.parse(mockApiRequest.mock.calls[0][1].body)).toEqual({ refreshToken: 'old-refresh' });
  });

  it('rejects incomplete refresh credentials', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, { accessToken: 'a', expiresIn: 50 }));
    await expect(refreshUser('old-refresh')).rejects.toThrow('incomplete refresh response');
  });

  it('invokes response validation for registration and login', async () => {
    mockApiRequest.mockResolvedValue(fakeResponse(200, TOKENS));
    await registerUser('a@example.test', 'password');
    await loginUser('a@example.test', 'password');
    expect(mockEnsureOk).toHaveBeenCalledTimes(2);
  });
});
