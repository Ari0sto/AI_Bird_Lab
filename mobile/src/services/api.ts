import { fetch as expoFetch } from 'expo/fetch';
// All requests go through the C# Central Server, not directly to FastAPI.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is missing in mobile/.env');
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('ngrok-skip-browser-warning', '1');

  const url = `${API_URL}${path}`;

  console.log('[API] URL:', url);
  console.log('[API] Method:', options.method || 'GET');
  console.log('[API] Body type:', options.body instanceof FormData ? 'FormData' : typeof options.body);

  try {
    const response = await expoFetch(url, {
      ...options,
      headers,
    });

    console.log('[API] Status:', response.status);

    return response;
  } catch (error) {
    console.error('[API] Fetch error:', error);

    throw error;
  }
}

// Works with ASP.NET Core Identity validation errors and FastAPI errors.
export async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;

  let message = `Server error: HTTP ${response.status}`;
  try {
    const data: unknown = await response.json();
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.detail === 'string') message = obj.detail;
      else if (typeof obj.title === 'string') message = obj.title;
      else if (typeof obj.message === 'string') message = obj.message;
      else if (Array.isArray(obj.detail)) {
        message = obj.detail.map((x: any) => String(x?.msg ?? x)).join('; ');
      }
      if (obj.errors && typeof obj.errors === 'object') {
        const values = Object.values(obj.errors as Record<string, unknown>);
        const problems = values.flatMap(v => Array.isArray(v) ? v : [v]).map(String);
        if (problems.length) message = problems.join('; ');
      }
    }
  } catch {
    // Preserve HTTP status for empty or non-JSON errors.
  }
  throw new Error(message);
}
