// Auto-migration runner. SQL statements are embedded as string literals so
// the migrations always run in production regardless of whether the
// `database/migrations/` folder ships with the build.

import pool from './db';

let migrationsPromise: Promise<void> | null = null;

export function runMigrationsOnce(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations().catch(err => {
      migrationsPromise = null;
      throw err;
    });
  }
  return migrationsPromise;
}

type Migration = { name: string; up: string[] };

// New migrations: append at the bottom. Each entry's `up` is an array of
// SQL statements (no trailing `;`). Filename-style names are arbitrary —
// the runner keys on `name` in the `_migrations` tracking table.
const MIGRATIONS: Migration[] = [
  {
    name: '002_wo_spesifikasi_paket',
    up: [
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `paket` VARCHAR(100) NULL AFTER `nama_spesifikasi`",
    ],
  },
  {
    name: '003_work_orders_tracking_hash',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `tracking_hash` VARCHAR(64) NULL UNIQUE AFTER `no_wo`",
      "UPDATE `work_orders` SET `tracking_hash` = SHA2(`no_wo`, 256) WHERE `tracking_hash` IS NULL",
      "UPDATE `orders` o JOIN `work_orders` w ON w.order_id = o.id SET o.tracking_link = CONCAT('/tracking/', w.tracking_hash) WHERE w.tracking_hash IS NOT NULL AND o.tracking_link IS NOT NULL AND o.tracking_link LIKE '/tracking/%'",
    ],
  },
  {
    name: '004_wo_spesifikasi_imported_file',
    up: [
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `imported_file` LONGTEXT NULL",
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `imported_file_name` VARCHAR(255) NULL",
    ],
  },
  {
    name: '005_wo_spesifikasi_imported_file_pages',
    up: [
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `imported_file_pages` TEXT NULL",
    ],
  },
  {
    name: '006_wo_section_imports',
    up: [
      `CREATE TABLE IF NOT EXISTS \`wo_section_imports\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`work_order_id\` INT UNSIGNED NOT NULL,
        \`section\` VARCHAR(20) NOT NULL,
        \`imported_file\` VARCHAR(500) NULL,
        \`imported_file_name\` VARCHAR(255) NULL,
        \`imported_file_pages\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_wo_section\` (\`work_order_id\`, \`section\`),
        KEY \`fk_si_wo\` (\`work_order_id\`),
        CONSTRAINT \`fk_si_wo\` FOREIGN KEY (\`work_order_id\`) REFERENCES \`work_orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    name: '007_work_orders_master_import',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `master_import_file` VARCHAR(500) NULL",
      "ALTER TABLE `work_orders` ADD COLUMN `master_import_file_name` VARCHAR(255) NULL",
    ],
  },
  {
    name: '008_settings_admin_whatsapp',
    up: [
      // Seed admin/CS WhatsApp number for the tracking page "Hubungi via WhatsApp"
      // button. INSERT IGNORE so a later manual edit to the settings row is
      // respected (subsequent deploys won't overwrite it).
      "INSERT IGNORE INTO `settings` (`key_name`, `value`) VALUES ('admin_whatsapp', '089526216529')",
    ],
  },
  {
    name: '009_orders_pilihan_paket',
    up: [
      // Service tier picked at order creation: Reguler, Express, or Prioritas.
      // Nullable so existing rows stay valid; the form now requires it for new orders.
      "ALTER TABLE `orders` ADD COLUMN `pilihan_paket` VARCHAR(20) NULL AFTER `nama_tim`",
    ],
  },
  {
    name: '010_monitoring_produksi',
    up: [
      // Tracks each order's position through the monitoring boards:
      // proofing → perbanyak → print-fedar → print-grando → history.
      // One row per order (UNIQUE order_id). `keterangan` holds the proofing
      // dropdown value ("Belum ACC" / "Revisi Proofing"). `completed_at` is set
      // when the row is checked off the last board and lands in history.
      `CREATE TABLE IF NOT EXISTS \`monitoring_produksi\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`board\` VARCHAR(20) NOT NULL DEFAULT 'proofing',
        \`keterangan\` VARCHAR(30) NULL DEFAULT 'Belum ACC',
        \`completed_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_mp_order\` (\`order_id\`),
        KEY \`fk_mp_order\` (\`order_id\`),
        CONSTRAINT \`fk_mp_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
];

async function runMigrations(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`_migrations\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`filename\` VARCHAR(255) NOT NULL UNIQUE,
      \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );

  const [appliedRows] = await pool.execute('SELECT `filename` FROM `_migrations`');
  const applied = new Set<string>(
    (appliedRows as { filename: string }[]).map(r => r.filename)
  );

  for (const mig of MIGRATIONS) {
    if (applied.has(mig.name)) continue;
    for (const stmt of mig.up) {
      try {
        await pool.query(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const benign = /Duplicate column|already exists|Duplicate key/i.test(msg);
        if (!benign) {
          console.error(`[migrate] ${mig.name} failed:`, msg);
          throw err;
        }
      }
    }
    await pool.execute('INSERT IGNORE INTO `_migrations` (`filename`) VALUES (?)', [mig.name]);
    console.log(`[migrate] applied ${mig.name}`);
  }
}
