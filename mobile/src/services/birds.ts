import { ensureOk } from './api';

import { File } from 'expo-file-system';

type AuthFetch = (path: string, options?: RequestInit) => Promise<Response>;

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

export type LocalUpload = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

export function percentage(confidence: number | null | undefined): string {
  return typeof confidence === 'number' ? `${(confidence * 100).toFixed(1)}%` : '—';
}

export async function analyzeBird(
  authFetch: AuthFetch,
  mode: 'image' | 'audio',
  file: LocalUpload
): Promise<Analysis> {
  const uploadFile = new File(file.uri);

  console.log('[UPLOAD] URI:', file.uri);
  console.log('[UPLOAD] Exists:', uploadFile.exists);

  const data = new FormData();

  data.append('file', uploadFile, file.name);

  const response = await authFetch(
    `/api/ai/analyze/${mode}`,
    {
      method: 'POST',
      body: data,
    }
  );

  await ensureOk(response);

  return (await response.json()) as Analysis;
}

export async function getHistory(authFetch: AuthFetch, search = ''): Promise<HistoryItem[]> {
  const response = await authFetch(`/api/ai/history?search=${encodeURIComponent(search)}`);
  await ensureOk(response);
  return (await response.json()) as HistoryItem[];
}

export async function deleteHistory(authFetch: AuthFetch, id: number): Promise<void> {
  const response = await authFetch(`/api/ai/history/${id}`, { method: 'DELETE' });
  await ensureOk(response);
}

export async function getStatistics(authFetch: AuthFetch): Promise<Statistics> {
  const response = await authFetch('/api/ai/stats');
  await ensureOk(response);
  return (await response.json()) as Statistics;
}

export async function getExportCsv(authFetch: AuthFetch): Promise<string> {
  const response = await authFetch('/api/ai/export');
  await ensureOk(response);
  return response.text();
}
