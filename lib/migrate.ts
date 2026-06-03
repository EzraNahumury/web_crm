// Auto-migration runner. On app boot, this scans `database/migrations/`,
// tracks which files have been applied in a `_migrations` table, and runs
// any new ones in filename order. Safe to call multiple times.

import { readFile, readdir } from 'fs/promises';
import path from 'path';
import pool from './db';

let migrationsPromise: Promise<void> | null = null;

export function runMigrationsOnce(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations().catch(err => {
      // Reset on failure so the next request retries.
      migrationsPromise = null;
      throw err;
    });
  }
  return migrationsPromise;
}

async function runMigrations(): Promise<void> {
  const dir = path.join(process.cwd(), 'database', 'migrations');

  // Ensure the tracking table exists
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS \`_migrations\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`filename\` VARCHAR(255) NOT NULL UNIQUE,
      \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );

  // Read applied migrations
  const [appliedRows] = await pool.execute(
    'SELECT `filename` FROM `_migrations`'
  );
  const applied = new Set<string>(
    (appliedRows as { filename: string }[]).map(r => r.filename)
  );

  // Discover .sql files in chronological (filename) order
  let files: string[];
  try {
    files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  } catch {
    // No migrations folder shipped — nothing to do.
    return;
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    // Naive split by `;` — works for our migrations (no semicolons inside
    // string literals, no procedural blocks). Trim & skip empties / comments.
    const statements = sql
      .split(/;[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !/^--/.test(s));

    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err) {
        // Tolerate idempotent failures (column already exists, etc.) so reruns
        // and partial-prior-applies recover gracefully.
        const msg = err instanceof Error ? err.message : String(err);
        const benign = /Duplicate column|already exists|Duplicate key/i.test(msg);
        if (!benign) {
          console.error(`[migrate] ${file} failed:`, msg);
          throw err;
        }
      }
    }

    await pool.execute('INSERT IGNORE INTO `_migrations` (`filename`) VALUES (?)', [file]);
    console.log(`[migrate] applied ${file}`);
  }
}
