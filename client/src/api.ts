import type { PublicDocument, Extraction, ExtractionProfile, Sheet } from '../../server/src/types';
export type { PublicDocument as Doc, Extraction, ExtractionProfile, Sheet };
export type User = { id: string; name: string; email: string; demo: boolean };
export type Settings = {
  localTraining: boolean;
  provider: 'local' | 'openai';
  model: string | null;
  extensions: string[];
  maxUploadBytes: number;
  maxDocuments: number;
  storage: string;
  queue: string;
  legacyOffice: string;
  scannedPdf: string;
  profiles: ExtractionProfile[];
};
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
export function download(id: string, format: 'json' | 'csv' | 'xlsx') {
  window.location.assign(`/api/documents/${id}/export?format=${format}`);
}
export const bytes = (size: number) =>
  size >= 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
export const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
