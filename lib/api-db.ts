// API client for database operations via /api/db/[table]

// fetch dengan retry opsional. Retry HANYA untuk GET (idempotent) supaya
// blip transient — koneksi DB basi, server sibuk sesaat — sembuh sendiri
// tanpa memunculkan layar "Gagal terhubung ke server".
//
// PENTING: TIDAK ada timeout/AbortController. Request yang lambat (mis.
// cold-start auto-migrate atau query berat) dibiarkan menunggu sampai
// selesai. Timeout AbortController sebelumnya justru membatalkan request
// yang sebenarnya sukses → "AbortError: signal is aborted without reason"
// di form (write) dan "Work Order tidak ditemukan" (read). Menunggu lebih
// baik daripada membatalkan.
export async function fetchJSON(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // 5xx = server transient (mis. koneksi DB basi) → ulang untuk GET.
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function dbGet<T = Record<string, unknown>>(
  table: string,
  search?: string,
  filter?: Record<string, string | number | null | undefined>,
): Promise<T[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (v != null && v !== '') params.set(k, String(v));
    }
  }
  // no-store so a fresh save is visible on the very next fetch —
  // Chromium sometimes caches identical GET urls otherwise.
  const res = await fetchJSON(`/api/db/${table}?${params}`, { cache: 'no-store' }, { retries: 2 });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function dbCreate(table: string, data: Record<string, unknown>): Promise<number> {
  const res = await fetchJSON(`/api/db/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.id;
}

export async function dbUpdate(table: string, id: number, data: Record<string, unknown>): Promise<void> {
  const res = await fetchJSON(`/api/db/${table}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function dbDelete(table: string, id: number): Promise<void> {
  const res = await fetchJSON(`/api/db/${table}?id=${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}
