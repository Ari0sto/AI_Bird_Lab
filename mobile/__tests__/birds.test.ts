const mockEnsureOk = jest.fn();
jest.mock('../src/services/api', () => ({ ensureOk: (...args: unknown[]) => mockEnsureOk(...args) }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, exists: true })),
}));

import {
  analyzeBird, deleteHistory, getExportCsv, getHistory,
  getStatistics, percentage,
} from '../src/services/birds';

const jsonResponse = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const authFetch = jest.fn();

// Expo File implements the React Native multipart file format. Node's native
// FormData only supports strings and Blob objects, so use a recording double
// to verify what analyzeBird sends without changing the application code.
class MockReactNativeFormData {
  readonly fields: Array<{ name: string; value: unknown; filename?: string }> = [];

  append(name: string, value: unknown, filename?: string): void {
    this.fields.push({ name, value, filename });
  }
}

const originalFormDataDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'FormData');

beforeAll(() => {
  Object.defineProperty(globalThis, 'FormData', {
    configurable: true, writable: true, value: MockReactNativeFormData,
  });
});

afterAll(() => {
  if (originalFormDataDescriptor) {
    Object.defineProperty(globalThis, 'FormData', originalFormDataDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'FormData');
  }
});

beforeEach(() => {
  authFetch.mockReset();
  mockEnsureOk.mockReset();
});

describe('Mobile bird analysis and history', () => {
  it.each([
    [0, '0.0%'],
    [0.875, '87.5%'],
    [1, '100.0%'],
    [null, '—'],
    [undefined, '—'],
  ] as [number | null | undefined, string][] )('formats confidence %s as %s', (value, expected) => {
    expect(percentage(value)).toBe(expected);
  });

  it.each(['image', 'audio'] as const)('uploads a %s analysis through authorized fetch', async mode => {
    const result = { id: 22, filename: 'bird.png', media_type: mode };
    authFetch.mockResolvedValue(jsonResponse(result));
    expect(await analyzeBird(authFetch, mode, {
      uri: 'file:///bird.png', name: 'bird.png', mimeType: 'image/png',
    })).toEqual(result);
    expect(authFetch.mock.calls[0][0]).toBe(`/api/ai/analyze/${mode}`);
    expect(authFetch.mock.calls[0][1].method).toBe('POST');
    const form = authFetch.mock.calls[0][1].body as MockReactNativeFormData;
    expect(form).toBeInstanceOf(MockReactNativeFormData);
    expect(form.fields).toEqual([{
      name: 'file',
      value: { uri: 'file:///bird.png', exists: true },
      filename: 'bird.png',
    }]);
    expect(mockEnsureOk).toHaveBeenCalledTimes(1);
  });

  it('escapes history search parameters', async () => {
    authFetch.mockResolvedValue(jsonResponse([]));
    await getHistory(authFetch, 'blue jay & raven');
    expect(authFetch.mock.calls[0][0]).toBe('/api/ai/history?search=blue%20jay%20%26%20raven');
  });

  it('deletes the selected history record', async () => {
    authFetch.mockResolvedValue(jsonResponse({ deleted: true }));
    await deleteHistory(authFetch, 5);
    expect(authFetch).toHaveBeenCalledWith('/api/ai/history/5', { method: 'DELETE' });
  });

  it('retrieves statistics', async () => {
    authFetch.mockResolvedValue(jsonResponse({ total: 3 }));
    expect((await getStatistics(authFetch)).total).toBe(3);
    expect(authFetch.mock.calls[0][0]).toBe('/api/ai/stats');
  });

  it('exports server-generated CSV text', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'id,species\n1,Raven' });
    expect(await getExportCsv(authFetch)).toContain('Raven');
    expect(authFetch.mock.calls[0][0]).toBe('/api/ai/export');
  });
});
