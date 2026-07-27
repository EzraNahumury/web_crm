import mysql from 'mysql2/promise';

// Pool koneksi READ-ONLY ke database reseller (u768480753_perusahaan
// di Hostinger). Terpisah dari pool CRM utama supaya:
// 1. Kredensial reseller bisa punya scope SELECT saja (defense in depth).
// 2. Kalau pool utama sibuk, query reseller tidak antre di pool yang sama.
// 3. Migration runner CRM tidak menyentuh DB reseller sama sekali.
//
// Env vars yang perlu diset (di .env.local untuk dev, di Hostinger
// environment untuk prod):
//   RESELLER_DB_HOST     (biasanya sama dengan DB_HOST)
//   RESELLER_DB_PORT     (default 3306)
//   RESELLER_DB_USER     (user read-only baru yang punya akses ke DB reseller)
//   RESELLER_DB_PASSWORD
//   RESELLER_DB_NAME     (u768480753_perusahaan)
//
// Kalau env RESELLER_DB_HOST tidak diset, pool tidak dibuat — API yang
// pakai pool ini harus throw error yang jelas supaya operator tahu
// env-nya belum lengkap.

let _pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (_pool) return _pool;
  const host = process.env.RESELLER_DB_HOST;
  if (!host) {
    throw new Error(
      'RESELLER_DB_HOST env belum diset. Lengkapi env RESELLER_DB_HOST / RESELLER_DB_USER / RESELLER_DB_PASSWORD / RESELLER_DB_NAME dulu supaya CRM bisa akses database reseller.'
    );
  }
  _pool = mysql.createPool({
    host,
    port: Number(process.env.RESELLER_DB_PORT) || 3306,
    user: process.env.RESELLER_DB_USER || '',
    password: process.env.RESELLER_DB_PASSWORD || '',
    database: process.env.RESELLER_DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  return _pool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = any[];

export async function queryReseller<T = Record<string, unknown>>(
  sql: string,
  params?: Params
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params ?? []);
  return rows as T[];
}

export async function queryOneReseller<T = Record<string, unknown>>(
  sql: string,
  params?: Params
): Promise<T | null> {
  const rows = await queryReseller<T>(sql, params);
  return rows[0] || null;
}
