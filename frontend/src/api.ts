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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Не удалось подключиться к backend. Проверьте FastAPI на порту 8000.');
  }
  if (!response.ok) {
    let detail = `Ошибка сервера (${response.status}).`;
    try {
      const json: { detail?: string | { msg: string }[] } = await response.json();
      if (typeof json.detail === 'string') detail = json.detail;
      else if (Array.isArray(json.detail)) detail = json.detail.map(x => x.msg).join('; ');
    } catch { /* HTTP error without JSON */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function recognize(file: File, mode: 'image' | 'audio'): Promise<Analysis> {
  const form = new FormData();
  form.append('file', file);
  return request<Analysis>(`/api/analyze/${mode}`, { method: 'POST', body: form });
}
export function fetchHistory(search = ''): Promise<HistoryItem[]> {
  return request<HistoryItem[]>(`/api/history?search=${encodeURIComponent(search)}`);
}
export function removeHistory(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/history/${id}`, { method: 'DELETE' });
}
export function fetchStats(): Promise<Statistics> {
  return request<Statistics>('/api/stats');
}
