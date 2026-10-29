export type Prediction = { species: string; confidence: number };
export type BirdInfo = {
  scientific_name: string;
  family: string;
  range: string;
  diet: string;
  description: string;
  wikipedia_url: string | null;
  wikidata_url: string | null;
};
export type Analysis = {
  id: number;
  filename: string;
  media_type: 'image' | 'audio';
  predictions: Prediction[];
  info: BirdInfo;
  notice: string;
};
export type HistoryItem = {
  id: number;
  image_name: string;
  predicted_species: string;
  confidence: number;
  analysis_date: string;
  description: string;
  media_type: 'image' | 'audio';
};
export type Statistics = {
  total: number;
  max_confidence: number | null;
  min_confidence: number | null;
  frequent_species: { species: string; count: number }[];
};

const API_URL = 'http://localhost:5000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;

  const headers = new Headers(options?.headers);

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Не удалось подключиться к Central Server. Проверьте Docker и порт 5000.'
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Необходима авторизация. Выполните вход.');
    }

    let detail = `Ошибка сервера (${response.status}).`;

    try {
      const json: { detail?: string | { msg: string }[] } =
        await response.json();

      if (typeof json.detail === 'string') {
        detail = json.detail;
      } else if (Array.isArray(json.detail)) {
        detail = json.detail.map(x => x.msg).join('; ');
      }
    } catch {
      // HTTP error without JSON
    }

    throw new Error(detail);
  }

  const text = await response.text();

  return text ? JSON.parse(text) as T : undefined as T;
}

export function recognize(
  file: File,
  mode: 'image' | 'audio'
): Promise<Analysis> {
  const form = new FormData();
  form.append('file', file);

  return request<Analysis>(`/api/ai/analyze/${mode}`, {
    method: 'POST',
    body: form,
  });
}

export function fetchHistory(search = ''): Promise<HistoryItem[]> {
  return request<HistoryItem[]>(
    `/api/ai/history?search=${encodeURIComponent(search)}`
  );
}

export function removeHistory(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/api/ai/history/${id}`,
    { method: 'DELETE' }
  );
}

export function fetchStats(): Promise<Statistics> {
  return request<Statistics>('/api/ai/stats');
}

export type LoginResponse = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const result = await request<LoginResponse>(
    '/api/auth/login?useCookies=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );

  setAccessToken(result.accessToken);

  return result;
}

export function register(
  email: string,
  password: string
): Promise<unknown> {
  return request<unknown>('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): void {
  setAccessToken(null);
}

// Export CSV with authorization
export async function exportCsv(): Promise<Blob> {
  if (!accessToken) {
    throw new Error('Необходима авторизация.');
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/ai/export`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new Error('Не удалось подключиться к Central Server.');
  }

  if (!response.ok) {
    throw new Error(`Ошибка экспорта CSV (${response.status}).`);
  }

  return response.blob();
}
