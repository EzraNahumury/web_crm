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

// Helper: query with typed result
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = any[];

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Params
): Promise<T[]> {
  await ensureMigrated();
  const [rows] = await pool.execute(sql, params ?? []);
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
  await ensureMigrated();
  const [result] = await pool.execute(sql, params ?? []);
  return (result as { insertId: number }).insertId;
}

export async function execute(
  sql: string,
  params?: Params
): Promise<number> {
  await ensureMigrated();
  const [result] = await pool.execute(sql, params ?? []);
  return (result as { affectedRows: number }).affectedRows;
}
