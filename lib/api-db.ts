// API client for database operations via /api/db/[table]

export async function dbGet<T = Record<string, unknown>>(table: string, search?: string): Promise<T[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const res = await fetch(`/api/db/${table}?${params}`);
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
