import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ayres_crm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Jaga koneksi TCP tetap hidup supaya MySQL/firewall tidak memutus
  // koneksi idle diam-diam (penyebab utama error "Gagal terhubung ke
  // server" yang muncul acak padahal server sehat).
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
});

export default pool;

// Lazy auto-migration: the first DB-touching request after a cold start
// will trigger any pending migrations before its query runs.
let _migrated: Promise<void> | null = null;
async function ensureMigrated() {
  if (!_migrated) {
    _migrated = (async () => {
      try {
        const { runMigrationsOnce } = await import('./migrate');
        await runMigrationsOnce();
      } catch (err) {
        _migrated = null;
        console.error('[db] migration error:', err);
      }
    })();
  }
  return _migrated;
}

// Error koneksi transient: koneksi pool basi/putus, pool penuh sesaat,
// dsb. Aman diulang untuk operasi baca; untuk tulis kita pakai strategi
// ping-dulu (lihat writeExec) supaya tidak ada risiko dobel-eksekusi.
const TRANSIENT_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_CON_COUNT_ERROR',
]);
function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}
function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

// Helper: query with typed result
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecResult = [any, any];

// BACA — idempotent, jadi aman diulang beberapa kali kalau kena koneksi
// basi. Tiap pool.execute mengambil koneksi baru dari pool, koneksi mati
// otomatis dibuang mysql2, percobaan berikut dapat koneksi segar.
async function readExec(sql: string, params?: Params): Promise<ExecResult> {
  await ensureMigrated();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool.execute(sql, params ?? []) as ExecResult;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === 2) throw err;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastErr;
}

// TULIS — TIDAK di-retry (kalau koneksi putus setelah statement terkirim,
// mengulang bisa dobel-insert). Sebagai gantinya: ambil koneksi, ping dulu
// untuk memastikan hidup; kalau mati, buang dan ambil yang segar — lalu
// jalankan tulis PERSIS SEKALI di koneksi yang sudah terbukti hidup.
async function writeExec(sql: string, params?: Params): Promise<ExecResult> {
  await ensureMigrated();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let conn: mysql.PoolConnection | undefined;
    try {
      conn = await pool.getConnection();
      await conn.ping();
    } catch (err) {
      lastErr = err;
      if (conn) { try { conn.destroy(); } catch { /* sudah mati */ } }
      if (!isTransient(err) || attempt === 2) throw err;
      await sleep(150 * (attempt + 1));
      continue;
    }
    // Koneksi hidup — jalankan tulis sekali saja, apa pun hasilnya.
    try {
      return await conn.execute(sql, params ?? []) as ExecResult;
    } finally {
      conn.release();
    }
  }
  throw lastErr;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Params
): Promise<T[]> {
  const [rows] = await readExec(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: Params
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function insert(
  sql: string,
  params?: Params
): Promise<number> {
  const [result] = await writeExec(sql, params);
  return (result as { insertId: number }).insertId;
}

export async function execute(
  sql: string,
  params?: Params
): Promise<number> {
  const [result] = await writeExec(sql, params);
  return (result as { affectedRows: number }).affectedRows;
}
