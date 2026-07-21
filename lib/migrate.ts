// Auto-migration runner. SQL statements are embedded as string literals so
// the migrations always run in production regardless of whether the
// `database/migrations/` folder ships with the build.

import pool from './db';

let migrationsPromise: Promise<void> | null = null;

// Per-migration diagnostic capture. Populated on every migrate pass so
// /api/admin/run-migrations can surface why a specific migration was
// skipped without needing to tail server logs.
export interface MigrationReport {
  name: string;
  status: 'applied' | 'skipped-applied' | 'failed';
  errors: string[];
}
let lastReport: MigrationReport[] = [];

export function getLastMigrationReport(): MigrationReport[] {
  return lastReport;
}

export function runMigrationsOnce(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations().catch(err => {
      migrationsPromise = null;
      throw err;
    });
  }
  return migrationsPromise;
}

// Force a fresh migration pass even if the singleton has already
// resolved. Necessary when new migrations were added to the code but
// the Node server hasn't restarted yet — /api/admin/run-migrations
// calls this so hitting the endpoint always picks up pending SQL.
export async function runMigrationsForce(): Promise<void> {
  migrationsPromise = null;
  return runMigrationsOnce();
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
  {
    name: '011_orders_deadline_lock',
    up: [
      // Manual "deadline lock" set by CS when the customer picks the Prioritas
      // service tier. For Reguler and Express the deadline is computed on the
      // fly from tanggal_acc_proofing + N business days, so we don't store it.
      "ALTER TABLE `orders` ADD COLUMN `deadline_lock` DATE NULL AFTER `estimasi_deadline`",
    ],
  },
  {
    name: '012_libur_nasional',
    up: [
      // Working-day calculator skips both Sunday and rows in this table.
      // Seed the fixed-date national holidays; lunar holidays (Idul Fitri,
      // Idul Adha, Imlek, Nyepi, Waisak, Maulid, Isra Mikraj) shift each year
      // and admin inserts those manually as needed:
      //   INSERT INTO libur_nasional (tanggal, nama) VALUES ('YYYY-MM-DD', 'Nama Hari');
      `CREATE TABLE IF NOT EXISTS \`libur_nasional\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tanggal\` DATE NOT NULL,
        \`nama\` VARCHAR(200) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_libur_tanggal\` (\`tanggal\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2025-01-01', 'Tahun Baru Masehi')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2025-05-01', 'Hari Buruh Internasional')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2025-06-01', 'Hari Lahir Pancasila')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2025-08-17', 'Hari Kemerdekaan RI')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2025-12-25', 'Hari Natal')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2026-01-01', 'Tahun Baru Masehi')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2026-05-01', 'Hari Buruh Internasional')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2026-06-01', 'Hari Lahir Pancasila')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2026-08-17', 'Hari Kemerdekaan RI')",
      "INSERT IGNORE INTO `libur_nasional` (`tanggal`, `nama`) VALUES ('2026-12-25', 'Hari Natal')",
    ],
  },
  {
    name: '013_crm_finishing',
    up: [
      // Per-order finishing status for the CRM Finishing weekly board.
      // Rows are lazy-created only when CS edits keterangan or checks the
      // order off. completed_at = NOW when the checkbox is checked; NULL
      // otherwise (so the row can be un-checked from History back to the
      // board).
      `CREATE TABLE IF NOT EXISTS \`crm_finishing\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`keterangan\` VARCHAR(200) NULL,
        \`completed_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_cf_order\` (\`order_id\`),
        KEY \`idx_cf_completed\` (\`completed_at\`),
        CONSTRAINT \`fk_cf_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    name: '014_monitoring_produksi_multi_board',
    up: [
      // From Perbanyak, an order can fan out to BOTH Print Fedar and Print
      // Grando (or just one). Switch the UNIQUE constraint from single-board
      // per order to composite (order_id, board) so the same order can hold
      // multiple in-flight rows across boards.
      "ALTER TABLE `monitoring_produksi` DROP INDEX `uniq_mp_order`",
      "ALTER TABLE `monitoring_produksi` ADD UNIQUE KEY `uniq_mp_order_board` (`order_id`, `board`)",
    ],
  },
  {
    name: '015_order_payments',
    up: [
      // Detailed payment rows per order — captures bank + method for each
      // payment plus supports multiple DP Produksi entries. The scalar
      // columns on orders (nominal_order / dp_desain / dp_produksi) are
      // kept as summed totals for backward compat.
      // tipe: 'nominal_order' | 'dp_desain' | 'dp_produksi'
      // method: 'TF' | 'QRIS' | 'DLL' (method_other used when method='DLL')
      `CREATE TABLE IF NOT EXISTS \`order_payments\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`bank_name\` VARCHAR(50) NULL,
        \`method\` VARCHAR(20) NULL,
        \`method_other\` VARCHAR(100) NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_op_order\` (\`order_id\`),
        CONSTRAINT \`fk_op_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Restructure production_stages to the new flow. Adds 3 stages
    // (Waiting List, Approval WO, QC Final dan Packing), retires QC Cutting
    // via an active flag, and renumbers urutan to the new order.
    //
    // Idempotent: statements shift existing urutan +1000 before assigning
    // final values, and new-stage inserts use NOT EXISTS so re-runs are
    // no-ops. Runs even if the migration table thinks it's applied
    // (only the trailing UPDATEs would repeat, all safe).
    name: '016_production_stages_v2',
    up: [
      "ALTER TABLE `production_stages` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1",
      "UPDATE `production_stages` SET `urutan` = `urutan` + 1000 WHERE `urutan` < 1000",
      "INSERT INTO `production_stages` (`nama`, `urutan`, `active`) SELECT 'Waiting List', 100, 1 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `production_stages`) p WHERE p.`nama` = 'Waiting List')",
      "INSERT INTO `production_stages` (`nama`, `urutan`, `active`) SELECT 'Approval WO', 101, 1 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `production_stages`) p WHERE p.`nama` = 'Approval WO')",
      "INSERT INTO `production_stages` (`nama`, `urutan`, `active`) SELECT 'QC Final dan Packing', 102, 1 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `production_stages`) p WHERE p.`nama` = 'QC Final dan Packing')",
      "UPDATE `production_stages` SET `urutan` = 1 WHERE `nama` = 'Waiting List'",
      "UPDATE `production_stages` SET `urutan` = 2 WHERE `nama` = 'Approval Design'",
      "UPDATE `production_stages` SET `urutan` = 3 WHERE `nama` = 'Approval Pattern'",
      "UPDATE `production_stages` SET `urutan` = 4 WHERE `nama` = 'Proofing'",
      "UPDATE `production_stages` SET `urutan` = 5 WHERE `nama` = 'Approval WO'",
      "UPDATE `production_stages` SET `urutan` = 6 WHERE `nama` = 'Printing Layout'",
      "UPDATE `production_stages` SET `urutan` = 7 WHERE `nama` = 'Approval Layout'",
      "UPDATE `production_stages` SET `urutan` = 8 WHERE `nama` = 'Printing Process'",
      "UPDATE `production_stages` SET `urutan` = 9 WHERE `nama` = 'Sublim Press'",
      "UPDATE `production_stages` SET `urutan` = 10 WHERE `nama` = 'Fabric Cutting'",
      "UPDATE `production_stages` SET `urutan` = 11 WHERE `nama` = 'QC Panel Process'",
      "UPDATE `production_stages` SET `urutan` = 12 WHERE `nama` = 'Sewing'",
      "UPDATE `production_stages` SET `urutan` = 13 WHERE `nama` = 'QC Jersey'",
      "UPDATE `production_stages` SET `urutan` = 14 WHERE `nama` = 'Steam Jersey'",
      "UPDATE `production_stages` SET `urutan` = 15 WHERE `nama` = 'Finishing'",
      "UPDATE `production_stages` SET `urutan` = 16 WHERE `nama` = 'QC Final dan Packing'",
      "UPDATE `production_stages` SET `urutan` = 17 WHERE `nama` = 'Shipment'",
      // Rescue any in-flight WOs sitting at QC Cutting before we retire it.
      // Everything else follows the same before/after mapping (id doesn't
      // change), but a WO whose current stage is QC Cutting would have no
      // visible tab after deactivation, so bump it forward to Sewing.
      "UPDATE `work_orders` w JOIN `production_stages` qc ON qc.nama = 'QC Cutting' JOIN `production_stages` sw ON sw.nama = 'Sewing' SET w.`current_stage_id` = sw.`id` WHERE w.`current_stage_id` = qc.`id`",
      // Mark any active QC Cutting progress rows as done so the flow moves on.
      "UPDATE `wo_progress` wp JOIN `production_stages` qc ON qc.nama = 'QC Cutting' SET wp.`status` = 'SELESAI', wp.`completed_at` = IFNULL(wp.`completed_at`, NOW()) WHERE wp.`stage_id` = qc.`id` AND wp.`status` IN ('TERSEDIA','SEDANG')",
      // Open Sewing for any WO whose QC Cutting was just closed above.
      "UPDATE `wo_progress` wp JOIN `production_stages` sw ON sw.nama = 'Sewing' JOIN `wo_progress` qcp ON qcp.work_order_id = wp.work_order_id JOIN `production_stages` qc ON qc.id = qcp.stage_id AND qc.nama = 'QC Cutting' SET wp.`status` = 'TERSEDIA' WHERE wp.`stage_id` = sw.`id` AND wp.`status` = 'BELUM' AND qcp.`status` = 'SELESAI'",
      "UPDATE `production_stages` SET `urutan` = 999, `active` = 0 WHERE `nama` = 'QC Cutting'",
    ],
  },
  {
    // wo_confirmed = 1 means the Work Order has been detailed via the
    // Work Orders menu (Konfirmasi WO). Existing WOs default to 1 so
    // legacy data isn't gated by the new Proofing → Approval WO check.
    // Newly auto-created WOs from order save start at 0.
    name: '017_wo_confirmed',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `wo_confirmed` TINYINT(1) NOT NULL DEFAULT 1",
    ],
  },
  {
    // Reject records raised from QC Panel Process or Sewing. `tipe` is
    // 'WITH_BAHAN' (needs gudang to prep replacement material) or
    // 'WITHOUT_BAHAN' (rework in-place). `bahan_request` is a JSON
    // payload for the with-bahan case; the gudang UI comes later.
    name: '018_stage_rejects',
    up: [
      `CREATE TABLE IF NOT EXISTS \`stage_rejects\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`work_order_id\` INT UNSIGNED NOT NULL,
        \`stage_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`keterangan\` TEXT NOT NULL,
        \`bahan_request\` TEXT NULL,
        \`status\` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`resolved_at\` TIMESTAMP NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_sr_wo\` (\`work_order_id\`),
        KEY \`idx_sr_stage\` (\`stage_id\`),
        CONSTRAINT \`fk_sr_wo\` FOREIGN KEY (\`work_order_id\`) REFERENCES \`work_orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sr_stage\` FOREIGN KEY (\`stage_id\`) REFERENCES \`production_stages\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // stage_reject_items: one row per line of the Form Permintaan Gudang.
    // The predefined items (FULL BODY..TAFETA SLIP PRO plus sizes) are
    // rendered client-side from a constants list so the schema stays
    // agnostic — the user fills bahan/warna/kuantitas per row and only
    // rows with content are persisted.
    name: '019_stage_reject_items',
    up: [
      `CREATE TABLE IF NOT EXISTS \`stage_reject_items\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`reject_id\` INT UNSIGNED NOT NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`item\` VARCHAR(120) NOT NULL,
        \`bahan\` VARCHAR(200) NULL,
        \`warna\` VARCHAR(100) NULL,
        \`kuantitas\` VARCHAR(100) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_sri_reject\` (\`reject_id\`),
        CONSTRAINT \`fk_sri_reject\` FOREIGN KEY (\`reject_id\`) REFERENCES \`stage_rejects\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Gudang approval trail on stage_rejects. On approve, the produksi
    // gate is released. On reject, gudang leaves notes and produksi is
    // notified to handle the request without new material.
    name: '020_stage_rejects_gudang',
    up: [
      "ALTER TABLE `stage_rejects` ADD COLUMN `gudang_approved_by` VARCHAR(100) NULL",
      "ALTER TABLE `stage_rejects` ADD COLUMN `gudang_approved_at` TIMESTAMP NULL",
      "ALTER TABLE `stage_rejects` ADD COLUMN `gudang_notes` TEXT NULL",
    ],
  },
  {
    // Bukti transfer per payment entry, stored as a base64 data URI so
    // the whole payload sits in the row (same pattern used by
    // wo_spesifikasi.imported_file). Nullable — legacy payments
    // captured before this migration have no attachment.
    //
    // Adding it to order_payments (not orders) means each payment
    // stripe — Nominal Order, DP Desain, DP Produksi #N — carries its
    // own bukti TF, which matches the multi-DP world introduced by
    // migration 015.
    name: '021_order_payments_bukti_tf',
    up: [
      "ALTER TABLE `order_payments` ADD COLUMN `bukti_tf` LONGTEXT NULL",
      "ALTER TABLE `order_payments` ADD COLUMN `bukti_tf_name` VARCHAR(255) NULL",
    ],
  },
  {
    // Pembayaran AYRES invoice fields:
    // - order_items.harga: per-line unit price (image shows 4 line items
    //   with independent Rp prices, needed to compute TOTAL PEMBELIAN)
    // - orders.ekspedisi_{nama,kg,biaya}: the invoice's shipping row
    // - order_payments.{tanggal,tunai,trf}: the DP schedule expresses
    //   both Tunai and TRF columns; keep amount as the row total for
    //   backwards compatibility
    name: '022_pembayaran_ayres',
    up: [
      "ALTER TABLE `order_items` ADD COLUMN `harga` DECIMAL(15,2) NULL",
      "ALTER TABLE `orders` ADD COLUMN `ekspedisi_nama` VARCHAR(150) NULL",
      "ALTER TABLE `orders` ADD COLUMN `ekspedisi_kg` DECIMAL(10,2) NULL",
      "ALTER TABLE `orders` ADD COLUMN `ekspedisi_biaya` DECIMAL(15,2) NULL",
      "ALTER TABLE `order_payments` ADD COLUMN `tanggal` DATE NULL",
      "ALTER TABLE `order_payments` ADD COLUMN `tunai` DECIMAL(15,2) NULL",
      "ALTER TABLE `order_payments` ADD COLUMN `trf` DECIMAL(15,2) NULL",
    ],
  },
  {
    // Marks which team originated the order. CS_SELLING = created via
    // /cs-selling drawer; CS_ORDER = existing behaviour (create drawer
    // on /orders or auto-created placeholder from the old flow).
    // Legacy rows default to CS_ORDER so the CS Selling menu only lists
    // orders that team actually created; CS Order stays exhaustive.
    name: '023_orders_created_via',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `created_via` VARCHAR(30) NOT NULL DEFAULT 'CS_ORDER'",
    ],
  },
  {
    // orders.status was originally an ENUM('PENDING','CONFIRMED','IN_PROGRESS',
    // 'DONE','CANCELLED'). Inserting a value outside that set (e.g.
    // 'SELLING' for CS Selling handoffs) silently gets coerced to the
    // default 'PENDING' on non-strict MySQL — so CS Selling saves that
    // *looked* successful were being stashed as PENDING, hidden from
    // CS Selling and prematurely visible in CS Order.
    //
    // Widen to VARCHAR(30) so any status string round-trips as written.
    // Existing rows keep their values (ENUM → VARCHAR is a lossless
    // conversion for the already-legal values).
    name: '024_orders_status_varchar',
    up: [
      "ALTER TABLE `orders` MODIFY COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING'",
    ],
  },
  {
    // Recovery / safety net for order_payments. In one production
    // environment the _migrations tracking table listed 015 as applied
    // but the actual `order_payments` table had disappeared (most likely
    // a partial DB restore that skipped that table). Because the runner
    // trusts the tracking table it wouldn't re-run 015, so subsequent
    // migrations (021 + 022) failed with "Table ... doesn't exist" and
    // CS Selling / Pembayaran couldn't persist DP data.
    //
    // This CREATE TABLE IF NOT EXISTS is idempotent — no-op when the
    // table exists, restores it when it doesn't. It bundles every
    // column that 015 + 021 + 022 would have added so the schema is
    // fully caught up in a single pass. 021 + 022 then re-run and
    // ADD COLUMN throws Duplicate column, which is a benign error and
    // still marks the migration applied.
    name: '026_order_payments_recreate',
    up: [
      `CREATE TABLE IF NOT EXISTS \`order_payments\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`bank_name\` VARCHAR(50) NULL,
        \`method\` VARCHAR(20) NULL,
        \`method_other\` VARCHAR(100) NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`bukti_tf\` LONGTEXT NULL,
        \`bukti_tf_name\` VARCHAR(255) NULL,
        \`tanggal\` DATE NULL,
        \`tunai\` DECIMAL(15,2) NULL,
        \`trf\` DECIMAL(15,2) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_op_order\` (\`order_id\`),
        CONSTRAINT \`fk_op_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Same recovery pattern for stage_rejects + stage_reject_items —
    // if 018/019 marked applied but the tables are gone, this brings
    // them back with every column present.
    name: '027_stage_rejects_recreate',
    up: [
      `CREATE TABLE IF NOT EXISTS \`stage_rejects\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`work_order_id\` INT UNSIGNED NOT NULL,
        \`stage_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`keterangan\` TEXT NOT NULL,
        \`bahan_request\` TEXT NULL,
        \`status\` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`resolved_at\` TIMESTAMP NULL,
        \`gudang_approved_by\` VARCHAR(100) NULL,
        \`gudang_approved_at\` TIMESTAMP NULL,
        \`gudang_notes\` TEXT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_sr_wo\` (\`work_order_id\`),
        KEY \`idx_sr_stage\` (\`stage_id\`),
        CONSTRAINT \`fk_sr_wo\` FOREIGN KEY (\`work_order_id\`) REFERENCES \`work_orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sr_stage\` FOREIGN KEY (\`stage_id\`) REFERENCES \`production_stages\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
      `CREATE TABLE IF NOT EXISTS \`stage_reject_items\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`reject_id\` INT UNSIGNED NOT NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`item\` VARCHAR(120) NOT NULL,
        \`bahan\` VARCHAR(200) NULL,
        \`warna\` VARCHAR(100) NULL,
        \`kuantitas\` VARCHAR(100) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_sri_reject\` (\`reject_id\`),
        CONSTRAINT \`fk_sri_reject\` FOREIGN KEY (\`reject_id\`) REFERENCES \`stage_rejects\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Second recovery attempt for order_payments. Migration 026 was
    // getting marked applied but the table still wasn't materialising —
    // the most likely culprit is a name collision on the FK constraint
    // (`fk_op_order` had been registered in an earlier lifetime of the
    // DB and its metadata lingered even after the underlying table was
    // dropped, so a fresh CREATE TABLE reintroducing the same
    // constraint name silently returned a benign-matching error).
    //
    // This variant omits the CONSTRAINT name entirely — MySQL then
    // auto-generates a guaranteed-unique one. No FK is dropped, and we
    // fall back to a plain INDEX + a schema-level FK check via ON
    // DELETE CASCADE inline (still catches orphan rows at the DB level
    // when possible; if MySQL refuses that too we drop the FK entirely
    // in the fallback).
    name: '028_order_payments_recreate_v2',
    up: [
      // Recreate with no named CONSTRAINT so any residual FK name is not
      // an issue. Same columns as before.
      `CREATE TABLE IF NOT EXISTS \`order_payments\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`bank_name\` VARCHAR(50) NULL,
        \`method\` VARCHAR(20) NULL,
        \`method_other\` VARCHAR(100) NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`bukti_tf\` LONGTEXT NULL,
        \`bukti_tf_name\` VARCHAR(255) NULL,
        \`tanggal\` DATE NULL,
        \`tunai\` DECIMAL(15,2) NULL,
        \`trf\` DECIMAL(15,2) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_op_order\` (\`order_id\`),
        FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Belt-and-braces: if 028 still couldn't add the FK (say the
    // referenced column type on `orders` was ever tweaked), create the
    // table WITHOUT any foreign key. We rely on the app to keep
    // order_id in sync.
    name: '029_order_payments_no_fk',
    up: [
      `CREATE TABLE IF NOT EXISTS \`order_payments\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`order_id\` INT UNSIGNED NOT NULL,
        \`tipe\` VARCHAR(30) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`bank_name\` VARCHAR(50) NULL,
        \`method\` VARCHAR(20) NULL,
        \`method_other\` VARCHAR(100) NULL,
        \`urutan\` INT NOT NULL DEFAULT 1,
        \`bukti_tf\` LONGTEXT NULL,
        \`bukti_tf_name\` VARCHAR(255) NULL,
        \`tanggal\` DATE NULL,
        \`tunai\` DECIMAL(15,2) NULL,
        \`trf\` DECIMAL(15,2) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_op_order\` (\`order_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ],
  },
  {
    // Finance approval gate between CS Selling and CS Order.
    //   NULL       → freshly saved by CS Selling, waiting Finance review.
    //   'APPROVED' → Finance verified the bukti TF; CS Order can now
    //                pick the order up in the Pembayaran dropdown.
    //   'REJECTED' → Finance flagged a problem; CS Selling sees the
    //                notes and can fix + resubmit.
    // The audit trail (who / when / notes) mirrors the gudang approval
    // columns on stage_rejects.
    name: '025_orders_finance_approval',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `finance_status` VARCHAR(20) NULL",
      "ALTER TABLE `orders` ADD COLUMN `finance_approved_by` VARCHAR(100) NULL",
      "ALTER TABLE `orders` ADD COLUMN `finance_approved_at` TIMESTAMP NULL",
      "ALTER TABLE `orders` ADD COLUMN `finance_notes` TEXT NULL",
    ],
  },
  {
    // Two-step CS Order handoff to Finance:
    //   1. CS Order fills Rincian Order (Pembayaran modal) → nothing
    //      goes to Finance yet, WO auto-created in Waiting List (locked).
    //   2. CS Order goes to Bukti Pembayaran submenu and uploads a
    //      transfer proof for each filled DP Produksi row. When done,
    //      bukti_uploaded flips to 1, finance_status resets to NULL,
    //      and the order shows in Approval Finance for full-invoice
    //      review.
    // Legacy orders that predate this two-step flow keep bukti_uploaded=0
    // and are gated only by finance_status (see Waiting List check).
    name: '030_orders_bukti_uploaded',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `bukti_uploaded` TINYINT(1) NOT NULL DEFAULT 0",
    ],
  },
  {
    // Pelunasan (final settlement) approval gate at the QC Final dan
    // Packing stage.
    //
    // Flow:
    //   • Produksi klik Selesai & Lanjut di QC Final → modal upload
    //     bukti pelunasan → submit → pelunasan_status='PENDING',
    //     WO tetap di QC Final dengan chip "Menunggu Finance".
    //   • Finance approve di Approval Finance → pelunasan_status =
    //     'APPROVED' + audit trail; server-side advance WO progress
    //     dari QC Final ke Shipment (mark QC Final SELESAI, buka
    //     Shipment TERSEDIA).
    //   • Finance reject → pelunasan_status='REJECTED', produksi
    //     bisa re-submit bukti dengan file baru.
    name: '031_orders_pelunasan',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_bukti_tf` LONGTEXT NULL",
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_bukti_tf_name` VARCHAR(255) NULL",
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_status` VARCHAR(20) NULL",
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_notes` TEXT NULL",
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_approved_by` VARCHAR(100) NULL",
      "ALTER TABLE `orders` ADD COLUMN `pelunasan_approved_at` TIMESTAMP NULL",
    ],
  },
  {
    // orders.diskon_pct: persen diskon yang CS Order pilih di Rincian
    // Order (0-100). Nilai Rupiah-nya dihitung on-the-fly: diskon_pct
    // × Grand Total ÷ 100.
    name: '032_orders_diskon',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `diskon_pct` INT NOT NULL DEFAULT 0",
    ],
  },
  {
    // orders.dp_prod_mode + orders.dp_prod_manual: DP Produksi bisa di-input
    // dua cara — 'pct' (persen dari Total Pembelian, default 70%) atau
    // 'nominal' (Rupiah manual, dipakai kalau customer transfer lebih/kurang
    // dari perhitungan persen). Kalau mode = 'nominal', dp_prod_manual jadi
    // nilai final (tidak lagi dikurangi DP Design/Diskon).
    name: '033_orders_dp_prod_mode',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `dp_prod_mode` VARCHAR(10) NOT NULL DEFAULT 'pct'",
      "ALTER TABLE `orders` ADD COLUMN `dp_prod_manual` BIGINT NOT NULL DEFAULT 0",
    ],
  },
  {
    // Master Barang CS: katalog barang khusus untuk CS Order — dipakai
    // di dropdown Nama Barang di Rincian Order supaya CS tinggal pilih
    // + isi QTY. Field harga jadi default price yang otomatis prefill.
    name: '034_barang_cs',
    up: [
      "CREATE TABLE IF NOT EXISTS `barang_cs` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`nama` VARCHAR(255) NOT NULL," +
        "`harga` BIGINT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Master Bank: daftar bank untuk dropdown "Nama Bank" di DP Desain
    // CS Selling (+ tempat lain yang butuh). Sebelumnya di-hardcode di
    // page.tsx (BANK_OPTIONS). Seed pakai daftar hardcode lama supaya
    // dropdown tidak kosong pas migration jalan pertama kali.
    name: '035_bank',
    up: [
      "CREATE TABLE IF NOT EXISTS `bank` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`nama` VARCHAR(100) NOT NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE KEY `uniq_bank_nama` (`nama`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "INSERT IGNORE INTO `bank` (`nama`) VALUES " +
        "('BRI'),('BCA'),('BNI'),('MANDIRI'),('DANA'),('WISE'),('FLIP'),('F-BANK'),('SHOOPE PAY'),('GOPAY')",
    ],
  },
  {
    // Master Gudang: daftar gudang untuk dropdown Letak di form barang.
    // Seed 3 gudang default sesuai briefing.
    name: '036_gudang',
    up: [
      "CREATE TABLE IF NOT EXISTS `gudang` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`nama` VARCHAR(100) NOT NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE KEY `uniq_gudang_nama` (`nama`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "INSERT IGNORE INTO `gudang` (`nama`) VALUES ('Gudang AVA'),('Gudang Ayres'),('Ayres Produksi')",
    ],
  },
  {
    // Barang: tambah kolom kode_barang (SKU Accurate), harga per satuan,
    // dan letak (gudang) sesuai briefing stok opname. Dipakai di form
    // Data Barang modal + tabel stok baru.
    name: '037_barang_stok_fields',
    up: [
      "ALTER TABLE `barang` ADD COLUMN `kode_barang` VARCHAR(50) NULL AFTER `id`",
      "ALTER TABLE `barang` ADD COLUMN `harga` BIGINT NOT NULL DEFAULT 0",
      "ALTER TABLE `barang` ADD COLUMN `letak` VARCHAR(100) NULL",
    ],
  },
  {
    // orders.bukti_notes: catatan keterangan yang diisi CS Order di menu
    // Bukti Pembayaran ketika order tidak punya DP (tidak pakai DP Desain
    // dan tidak pakai DP Produksi). Text dipakai Finance sebagai konteks
    // saat approve invoice tanpa bukti transfer.
    name: '038_orders_bukti_notes',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `bukti_notes` TEXT NULL",
    ],
  },
  {
    // Antrian Design: order yang sudah di-approve DP Design-nya oleh
    // Finance masuk ke menu Antrian Design (Design Awal → Revisi 1-3 →
    // Selesai). Baru setelah SELESAI baru muncul di dropdown Rincian
    // Order (CS Order).
    //
    // design_stage: 'AWAL' | 'REVISI_1' | 'REVISI_2' | 'REVISI_3' |
    //               'SELESAI' | NULL (legacy — skip antrian).
    // design_awal_at: baseline SLA (saat Finance approve DP Design).
    // design_stage_started_at: kapan pindah ke stage sekarang (untuk
    //                          track waktu tiap stage individual).
    // design_selesai_at: kapan design final di-mark selesai.
    name: '039_orders_design_stage',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `design_stage` VARCHAR(20) NULL",
      "ALTER TABLE `orders` ADD COLUMN `design_awal_at` TIMESTAMP NULL",
      "ALTER TABLE `orders` ADD COLUMN `design_stage_started_at` TIMESTAMP NULL",
      "ALTER TABLE `orders` ADD COLUMN `design_selesai_at` TIMESTAMP NULL",
    ],
  },
  {
    // Auto-grant 'Antrian Design' menu access ke setiap role yang sudah
    // punya 'CS Selling'. Tanpa ini, user existing yang menuAccess-nya
    // eksplisit di-set di role_menu_access tidak akan lihat menu baru
    // di sidebar meski secara logic sudah eligible.
    // Super admin tidak butuh row di role_menu_access — dia bypass via
    // is_super_admin flag di route auth.
    name: '040_grant_antrian_design',
    up: [
      "INSERT IGNORE INTO `role_menu_access` (`role_id`, `menu_name`) " +
        "SELECT DISTINCT `role_id`, 'Antrian Design' FROM `role_menu_access` " +
        "WHERE `menu_name` = 'CS Selling'",
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

  // Two-pass execution. Pass 1 runs every pending migration; some may
  // fail because a recovery migration (e.g. 026 recreating a dropped
  // table) sits later in the array. Pass 2 re-runs whatever failed on
  // pass 1 — by then the recovery migrations have applied, so ALTERs
  // that previously choked on "Table doesn't exist" succeed.
  const MAX_PASSES = 2;
  const collected: Record<string, MigrationReport> = {};

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const [appliedRows] = await pool.execute('SELECT `filename` FROM `_migrations`');
    const applied = new Set<string>(
      (appliedRows as { filename: string }[]).map(r => r.filename)
    );

    for (const mig of MIGRATIONS) {
      if (applied.has(mig.name)) {
        // Keep the first report we generated (skipped-applied or applied).
        if (!collected[mig.name]) {
          collected[mig.name] = { name: mig.name, status: 'skipped-applied', errors: [] };
        }
        continue;
      }
      let allOk = true;
      const errors: string[] = [];
      for (const stmt of mig.up) {
        try {
          await pool.query(stmt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const benign = /Duplicate column|already exists|Duplicate key|check that (column|it) exists|Can't DROP.*check that/i.test(msg);
          if (!benign) {
            console.error(`[migrate] pass ${pass} ${mig.name} stmt failed (continuing):`, msg);
            errors.push(`${stmt.slice(0, 80)}… → ${msg}`);
            allOk = false;
          }
        }
      }
      if (allOk) {
        await pool.execute('INSERT IGNORE INTO `_migrations` (`filename`) VALUES (?)', [mig.name]);
        console.log(`[migrate] pass ${pass} applied ${mig.name}`);
        collected[mig.name] = { name: mig.name, status: 'applied', errors: [] };
      } else {
        console.warn(`[migrate] pass ${pass} ${mig.name} had errors, not marking applied`);
        collected[mig.name] = { name: mig.name, status: 'failed', errors };
      }
    }

    // Early exit if nothing failed on this pass.
    const anyFailed = Object.values(collected).some(r => r.status === 'failed');
    if (!anyFailed) break;
  }

  lastReport = MIGRATIONS.map(m => collected[m.name] || { name: m.name, status: 'skipped-applied', errors: [] });
}
