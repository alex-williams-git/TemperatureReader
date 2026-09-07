// Backend base URL. Override with NEXT_PUBLIC_API_BASE (see .env.local.example).
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

export interface Reading {
  id: number;
  ts: string; // UTC ISO-8601
  temp_c: number;
  temp_f: number;
  humidity: number;
}

export interface AggregateBucket {
  bucket_start: string; // UTC ISO-8601, left edge of the bucket
  count: number;
  temp_c_avg: number;
  temp_c_min: number;
  temp_c_max: number;
  temp_f_avg: number;
  temp_f_min: number;
  temp_f_max: number;
  humidity_avg: number;
  humidity_min: number;
  humidity_max: number;
}

export interface Health {
  status: string;
  serial_connected: boolean;
  serial_last_error: string | null;
  last_reading_ts: string | null;
  total_readings: number;
}

/** SWR fetcher: the key IS the path (e.g. "/readings/latest"). */
export async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${path}`);
  }
  return (await res.json()) as T;
}

export function qs(params: Record<string, string | number>): string {
  return (
    "?" +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&")
  );
}
