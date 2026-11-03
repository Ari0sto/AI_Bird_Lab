export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('API URL is not configured.');
  }

  const headers = new Headers(options.headers);

  headers.set('ngrok-skip-browser-warning', '1');
  headers.set('Accept', 'application/json');

  const baseUrl = apiUrl.replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  return response;
}