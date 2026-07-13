// API client for database operations via /api/db/[table]

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
  const res = await fetch(`/api/db/${table}?${params}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function dbCreate(table: string, data: Record<string, unknown>): Promise<number> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.id;
}

export async function dbUpdate(table: string, id: number, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function dbDelete(table: string, id: number): Promise<void> {
  const res = await fetch(`/api/db/${table}?id=${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}
