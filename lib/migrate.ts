// Auto-migration runner. SQL statements are embedded as string literals so
// the migrations always run in production regardless of whether the
// `database/migrations/` folder ships with the build.

import pool from './db';
import { LINE_JAHIT_SEED_2026_SQL } from './seed-line-jahit-2026';

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
  {
    // Barang CS hitung_qty: apakah barang ini masuk ke jumlah qty utama
    // (default 1 = ya) atau cuma aksesoris/pelengkap (0). Dipakai waktu
    // auto-create shadow WO — totalQty di work_orders.jumlah tidak boleh
    // ikut-menghitung aksesoris supaya kapasitas produksi akurat.
    name: '041_barang_cs_hitung_qty',
    up: [
      "ALTER TABLE `barang_cs` ADD COLUMN `hitung_qty` TINYINT(1) NOT NULL DEFAULT 1",
    ],
  },
  {
    // Antrian Design Reject: customer batal lanjut pesanan padahal
    // sudah bayar DP Design. CS Design tekan tombol 'Batalkan' → order
    // design_stage jadi 'REJECTED' + design_rejected_at diisi timestamp.
    //
    // Filter existing di pembayaran-modal (`design_stage IN (NULL,
    // 'SELESAI')`) otomatis mengecualikan REJECTED — order tidak akan
    // muncul di dropdown Rincian Order CS Order.
    name: '042_orders_design_rejected_at',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `design_rejected_at` TIMESTAMP NULL",
    ],
  },
  {
    // Alasan reject — wajib diisi CS Design lewat modal batalkan.
    // Ditampilkan di tabel History Reject supaya bisa audit kenapa
    // customer batal.
    name: '044_orders_design_reject_reason',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `design_reject_reason` TEXT NULL",
    ],
  },
  {
    // Auto-grant menu 'Antrian Design' juga cover sub-menu History
    // Reject — pakai satu key menu supaya sidebar filter tidak perlu
    // 2 entry per role.
    name: '043_grant_antrian_design_history_reject',
    up: [
      // No-op — MENU_HREF_MAP di layout.tsx map 'Antrian Design' ke
      // 2 route (/antrian-design + /antrian-design/history-reject).
      // Row role_menu_access existing 'Antrian Design' otomatis grant
      // ke 2 route.
      "SELECT 1",
    ],
  },
  {
    // Line Jahit: catatan jahit internal per tanggal + customer, dengan
    // 3 kategori paket (STANDAR / KLASIK / PRO) × 2 tipe (Atasan /
    // Celana) = 6 kolom qty. Summary total per paket + grand total
    // dihitung di client.
    name: '045_line_jahit',
    up: [
      "CREATE TABLE IF NOT EXISTS `line_jahit` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`tanggal` DATE NOT NULL," +
        "`customer` VARCHAR(255) NOT NULL," +
        "`standar_atasan` INT NOT NULL DEFAULT 0," +
        "`standar_celana` INT NOT NULL DEFAULT 0," +
        "`klasik_atasan` INT NOT NULL DEFAULT 0," +
        "`klasik_celana` INT NOT NULL DEFAULT 0," +
        "`pro_atasan` INT NOT NULL DEFAULT 0," +
        "`pro_celana` INT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_lj_tanggal` (`tanggal`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Auto-grant menu 'Line Jahit' ke setiap role yang punya 'Produksi' —
    // asumsi tim produksi yang input data jahit internal.
    name: '046_grant_line_jahit',
    up: [
      "INSERT IGNORE INTO `role_menu_access` (`role_id`, `menu_name`) " +
        "SELECT DISTINCT `role_id`, 'Line Jahit' FROM `role_menu_access` " +
        "WHERE `menu_name` = 'Produksi'",
    ],
  },
  {
    // Seed data historis Line Jahit April-Juli 2026 (293 baris) dari file
    // Excel operator. Tracking via _migrations — hanya jalan sekali.
    name: '047_line_jahit_seed_2026',
    up: [LINE_JAHIT_SEED_2026_SQL],
  },
  {
    // Config paket Line Jahit — nama display + prefix kolom di tabel
    // line_jahit. Dipakai supaya operator bisa nambah paket baru
    // (WARRIOR, dll) via UI, dan endpoint /api/line-jahit/tambah-paket
    // yang menjalankan ALTER TABLE ADD COLUMN sesuai prefix.
    name: '048_line_jahit_paket',
    up: [
      "CREATE TABLE IF NOT EXISTS `line_jahit_paket` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`nama` VARCHAR(64) NOT NULL," +
        "`kolom_prefix` VARCHAR(32) NOT NULL," +
        "`urutan` INT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE KEY `uk_lj_paket_nama` (`nama`)," +
        "UNIQUE KEY `uk_lj_paket_prefix` (`kolom_prefix`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "INSERT IGNORE INTO `line_jahit_paket` (`nama`, `kolom_prefix`, `urutan`) VALUES " +
        "('STANDAR', 'standar', 1), ('KLASIK', 'klasik', 2), ('PRO', 'pro', 3)",
    ],
  },
  {
    // Pencatatan kedatangan penjahit per hari. Append-only log, tidak
    // ada uniqueness constraint di tanggal — operator boleh input lebih
    // dari satu record per tanggal kalau perlu.
    name: '049_penjahit_attendance',
    up: [
      "CREATE TABLE IF NOT EXISTS `penjahit_attendance` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`tanggal` DATE NOT NULL," +
        "`jumlah_standar` INT NOT NULL DEFAULT 0," +
        "`jumlah_special` INT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_pa_tanggal` (`tanggal`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Rate per paket per tipe (atasan/celana) — dipakai untuk konversi
    // ke poin. Base rate = 5000 (Standar Atasan = 1 poin), rate lain
    // di-scale relatif. Contoh: Klasik Atasan 7000 → 1.4 poin.
    // Seed 3 paket default sesuai rate card AYRES.
    name: '050_line_jahit_paket_rate',
    up: [
      "ALTER TABLE `line_jahit_paket` " +
        "ADD COLUMN `rate_atasan` INT NOT NULL DEFAULT 5000, " +
        "ADD COLUMN `rate_celana` INT NOT NULL DEFAULT 5000",
      "UPDATE `line_jahit_paket` SET `rate_atasan` = 5000, `rate_celana` = 5000 WHERE `kolom_prefix` = 'standar'",
      "UPDATE `line_jahit_paket` SET `rate_atasan` = 7000, `rate_celana` = 6000 WHERE `kolom_prefix` = 'klasik'",
      "UPDATE `line_jahit_paket` SET `rate_atasan` = 8500, `rate_celana` = 6000 WHERE `kolom_prefix` = 'pro'",
    ],
  },
  {
    // Backfill work_orders.customer_nama dari orders.customer_nama.
    // WO copy customer_nama saat dibuat, jadi kalau operator rename
    // customer di CS Selling setelah WO exist, WO stale. Ini fix
    // sekali untuk data yang sudah terlanjur out-of-sync. Prevention
    // (auto-cascade saat orders update) dilakukan di API layer.
    name: '051_backfill_wo_customer_nama',
    up: [
      "UPDATE `work_orders` wo " +
        "JOIN `orders` o ON o.id = wo.order_id " +
        "SET wo.customer_nama = o.customer_nama " +
        "WHERE COALESCE(wo.customer_nama, '') <> COALESCE(o.customer_nama, '')",
    ],
  },
  {
    // Form input harian CS Selling: jumlah leads yang masuk +
    // closingan yang berhasil di tanggal itu, di-attribute ke
    // satu lead (source). Append-only log — operator boleh input
    // multiple record per (lead, tanggal) kalau perlu re-adjust.
    name: '052_cs_form_leads',
    up: [
      "CREATE TABLE IF NOT EXISTS `cs_form_leads` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`lead_id` INT UNSIGNED NOT NULL," +
        "`tanggal` DATE NOT NULL," +
        "`jumlah_leads` INT NOT NULL DEFAULT 0," +
        "`jumlah_closingan` INT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_cfl_tanggal` (`tanggal`)," +
        "KEY `idx_cfl_lead` (`lead_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // WO1 (wo_spesifikasi) sekarang menyimpan Penanggung Jawab per 14
    // stage produksi (Approval Design, Approval Pattern, Proofing,
    // Printing Layout, Approval Layout, Printing Process, Sublim Press,
    // QC panel Process, Fabric Cutting, QC Cutting, Sewing, QC Jersey,
    // Finishing, Shipment). Disimpan sebagai JSON supaya kalau nanti
    // urutan / nama stage berubah, tinggal edit di layer aplikasi tanpa
    // migrate schema.
    name: '053_wo_spesifikasi_penanggung_jawab',
    up: [
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `penanggung_jawab_json` LONGTEXT NULL",
    ],
  },
  {
    // WO2 web form: Detail Ukuran Tim. Satu row per anggota tim dengan
    // pengukuran per bagian (BD, BB, Lengan Kanan/Kiri, Lis Lengan
    // Kanan/Kiri, Var Kerah, Kerah) + info umum (nama, NP, size, dua
    // KET, penjahit). NP = nomor punggung.
    name: '054_wo_ukuran_tim',
    up: [
      "CREATE TABLE IF NOT EXISTS `wo_ukuran_tim` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`work_order_id` INT UNSIGNED NOT NULL," +
        "`urutan` INT NOT NULL DEFAULT 0," +
        "`nama` VARCHAR(150) NULL," +
        "`np` VARCHAR(30) NULL," +
        "`size` VARCHAR(30) NULL," +
        "`ket1` VARCHAR(100) NULL," +
        "`ket2` VARCHAR(100) NULL," +
        "`bd` VARCHAR(30) NULL," +
        "`bb` VARCHAR(30) NULL," +
        "`lengan_kanan` VARCHAR(30) NULL," +
        "`lengan_kiri` VARCHAR(30) NULL," +
        "`lis_lengan_kanan` VARCHAR(30) NULL," +
        "`lis_lengan_kiri` VARCHAR(30) NULL," +
        "`var_kerah` VARCHAR(50) NULL," +
        "`kerah` VARCHAR(50) NULL," +
        "`penjahit` VARCHAR(100) NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_wut_wo` (`work_order_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // WO3 Form Pengiriman punya section PROMO + BONUS di sisi kanan
    // (di luar tabel per-anggota). Disimpan di work_orders langsung
    // sebagai kolom TEXT — 1 promo + 1 bonus per WO, bukan per item.
    name: '055_work_orders_pengiriman_promo_bonus',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `pengiriman_promo` TEXT NULL",
      "ALTER TABLE `work_orders` ADD COLUMN `pengiriman_bonus` TEXT NULL",
    ],
  },
  {
    // WO2 Detail Ukuran Tim sekarang punya kolom dynamic — operator
    // bisa tambah header (single atau grouped dengan sub-columns) dan
    // hapus kolom. Config kolom disimpan JSON di work_orders,
    // value row disimpan JSON di wo_ukuran_tim.data_json. Kolom legacy
    // (nama/np/size/…) tetap dipertahankan untuk backward compat —
    // saat load, value legacy di-merge ke data_json kalau data_json
    // masih kosong; saat save, semua write ke data_json.
    name: '056_wo2_dynamic_kolom',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `wo2_kolom_json` LONGTEXT NULL",
      "ALTER TABLE `wo_ukuran_tim` ADD COLUMN `data_json` LONGTEXT NULL",
    ],
  },
  {
    // Antrian Design: operator bisa isi alasan keterlambatan SLA per
    // order. Klik chip 'Terlambat SLA' di card → popup textarea →
    // simpan ke kolom ini. Muncul di sebelah chip sebagai badge kecil
    // supaya rekan setim bisa langsung tau kenapa telat.
    name: '057_orders_keterlambatan_reason',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `keterlambatan_reason` TEXT NULL",
    ],
  },
  {
    // Seed opsi Leads 'AYRES SOLO' untuk dropdown Form Leads Harian
    // (cs-selling / form-leads). Insert only kalau belum ada — nama
    // di-check case-insensitive (LOWER) supaya idempotent.
    name: '058_seed_lead_ayres_solo',
    up: [
      "INSERT INTO `leads` (`nama`) " +
        "SELECT 'AYRES SOLO' FROM DUAL " +
        "WHERE NOT EXISTS (SELECT 1 FROM `leads` WHERE LOWER(`nama`) = 'ayres solo')",
    ],
  },
  {
    // Order yang dibuat dari data reseller (CS Selling pick reseller
    // di create-order-drawer) di-snapshot ke 3 kolom ini supaya:
    //   • Grafik reseller history order tidak perlu cross-DB join
    //     (reseller di DB terpisah u768480753_perusahaan).
    //   • Kalau reseller di DB sumber ke-update/hapus, riwayat order
    //     tetap valid (snapshot immutable).
    //   • Filter order by reseller cepat (kolom local, indexed lebih
    //     mudah).
    // Semua nullable — order non-reseller tidak isi field ini.
    name: '059_orders_reseller_snapshot',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `reseller_id` VARCHAR(64) NULL",
      "ALTER TABLE `orders` ADD COLUMN `reseller_nama` VARCHAR(255) NULL",
      "ALTER TABLE `orders` ADD COLUMN `reseller_kota` VARCHAR(120) NULL",
      "ALTER TABLE `orders` ADD INDEX `idx_orders_reseller_id` (`reseller_id`)",
      "ALTER TABLE `orders` ADD INDEX `idx_orders_reseller_kota` (`reseller_kota`)",
    ],
  },
  {
    // History Produksi status pengiriman ke customer. Setelah WO selesai
    // (orders.status=DONE), operator produksi centang 'Status Terkirim'
    // di History Produksi:
    //   • status_terkirim: TINYINT(1), 1 = sudah dikirim
    //   • status_terkirim_at: TIMESTAMP saat centang aksi
    // Order dengan status_terkirim=1 muncul di menu Laporan Finance
    // sebagai audit trail — Finance bisa lihat rincian order awal.
    name: '060_orders_status_terkirim',
    up: [
      "ALTER TABLE `orders` ADD COLUMN `status_terkirim` TINYINT(1) NOT NULL DEFAULT 0",
      "ALTER TABLE `orders` ADD COLUMN `status_terkirim_at` TIMESTAMP NULL",
      "ALTER TABLE `orders` ADD INDEX `idx_orders_status_terkirim` (`status_terkirim`)",
    ],
  },
  {
    // WO1 spec card: 2 cell kiri-bawah ('EXPORT & ICC PRINT' label + nilai
    // export) sekarang bisa di-edit inline langsung di card. Nilai kanan
    // sudah pakai kolom export_icc; label kiri dulu hardcoded → tambah
    // kolom export_icc_label supaya bisa diubah & tersimpan. NULL = pakai
    // default 'EXPORT & ICC PRINT'.
    name: '061_wo_spesifikasi_export_icc_label',
    up: [
      "ALTER TABLE `wo_spesifikasi` ADD COLUMN `export_icc_label` VARCHAR(120) NULL",
    ],
  },
  {
    // WO4 Form Permintaan Gudang multi-form. Beberapa WO butuh > 1 form
    // (misal jersey + pants dengan bahan berbeda). Tambah form_no supaya
    // 1 WO bisa punya banyak form independent, masing-masing 16 items
    // fixed + 6 sizes + extras.
    //
    // form_no default 1 → existing rows dianggap Form #1 (backward compat).
    // Index composite (work_order_id, form_no) untuk group + query cepat.
    name: '062_wo_permintaan_gudang_form_no',
    up: [
      "ALTER TABLE `wo_permintaan_gudang` ADD COLUMN `form_no` INT NOT NULL DEFAULT 1",
      "ALTER TABLE `wo_permintaan_gudang` ADD INDEX `idx_wo_pg_form` (`work_order_id`, `form_no`)",
    ],
  },
  {
    // Menu "Stok" (single link) di-restructure jadi parent "Gudang" dengan
    // sub-menu Stok + Forecasting Bahan + Real Pengeluaran Bahan + Pembelian
    // Bahan. Semua role yang sebelumnya punya akses 'Stok' otomatis dapat
    // akses 'Gudang' supaya tidak kehilangan visibility menu.
    // INSERT IGNORE untuk avoid duplicate kalau row 'Gudang' sudah manual di-set.
    name: '063_role_menu_stok_to_gudang',
    up: [
      "INSERT IGNORE INTO `role_menu_access` (`role_id`, `menu_name`) " +
        "SELECT DISTINCT `role_id`, 'Gudang' FROM `role_menu_access` " +
        "WHERE `menu_name` = 'Stok'",
    ],
  },
  {
    // Laporan Produksi punya kolom KET dan NOTE per WO yang di-edit
    // langsung di halaman laporan (bukan sync dari kolom lain). KET =
    // catatan kecil per baris (default kosong), NOTE = catatan longer
    // form (contoh: "ANTRI FINISHING", "KURANG 2 JERSEY").
    name: '064_work_orders_laporan_ket_note',
    up: [
      "ALTER TABLE `work_orders` ADD COLUMN `laporan_ket` TEXT NULL",
      "ALTER TABLE `work_orders` ADD COLUMN `laporan_note` TEXT NULL",
    ],
  },
  {
    // Seed aksesoris ke barang_cs supaya rincian order dengan line item
    // KERAH / ukuran (XL/XXL/dst) tidak ikut nge-inflate wo.jumlah di
    // menu Produksi. Semua di-set hitung_qty=0 (MASUK QTY=Tidak).
    // INSERT IGNORE — kalau operator sudah manual add & set hitung_qty=1,
    // tidak overwrite. Harga 0 (aksesoris cuma add-on ke jersey utama).
    name: '065_seed_barang_cs_aksesoris',
    up: [
      "INSERT IGNORE INTO `barang_cs` (`nama`, `harga`, `hitung_qty`) VALUES " +
        "('KERAH KOMBINASI', 0, 0)," +
        "('KERAH RAJUT', 0, 0)," +
        "('KERAH RIB', 0, 0)," +
        "('KERAH SUBLIM', 0, 0)," +
        "('LENGAN PANJANG', 0, 0)," +
        "('REFLEKTIF', 0, 0)," +
        "('XS', 0, 0),('S', 0, 0),('M', 0, 0),('L', 0, 0)," +
        "('XL', 0, 0),('XXL', 0, 0),('2XL', 0, 0)," +
        "('XXXL', 0, 0),('3XL', 0, 0),('4XL', 0, 0),('5XL', 0, 0)",
    ],
  },
  {
    // One-time cleanup: user request untuk mulai dari nol di menu Stok.
    // Kosongkan barang (master data barang), stok (qty per barang), dan
    // stok_adjustment (riwayat mutasi). Migration idempotent — hanya
    // jalan sekali (nama di-track di _migrations). Kalau nanti perlu
    // reset lagi, buat migration baru dengan nama beda.
    //
    // Nullify wo_permintaan_gudang.barang_id dulu supaya DELETE barang
    // tidak fail karena FK (deducted stok reference). Data WO tetap
    // ada, cuma link barang-nya hilang.
    //
    // AUTO_INCREMENT reset ke 1 supaya ID baru mulai dari ID-1.
    name: '066_clear_stok_data',
    up: [
      "DELETE FROM `stok_adjustment`",
      "DELETE FROM `stok`",
      // Nullify wo_permintaan_gudang.barang_id kalau kolomnya ada.
      // Pakai dynamic SQL via prepared stmt supaya tidak fail kalau kolom
      // belum ada (deployment lama tanpa deduct-stok flow).
      "SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wo_permintaan_gudang' " +
        "AND COLUMN_NAME = 'barang_id')",
      "SET @sql := IF(@has_col > 0, " +
        "'UPDATE `wo_permintaan_gudang` SET `barang_id` = NULL WHERE `barang_id` IS NOT NULL', " +
        "'DO 0')",
      "PREPARE stmt FROM @sql",
      "EXECUTE stmt",
      "DEALLOCATE PREPARE stmt",
      "DELETE FROM `barang`",
      "ALTER TABLE `barang` AUTO_INCREMENT = 1",
      "ALTER TABLE `stok` AUTO_INCREMENT = 1",
      "ALTER TABLE `stok_adjustment` AUTO_INCREMENT = 1",
    ],
  },
  {
    // Forecasting Bahan — perkiraan kebutuhan bahan per WO.
    //
    // wo_forecast: 1 row per WO (header). Menandai bahwa forecast
    //   sudah dibuat — WO tanpa row header tidak muncul di list
    //   Forecasting Bahan (mereka available di picker "Buat Forecasting").
    // wo_forecast_bahan: baris detail per bagian (KAIN UTAMA/AUTENTIC/XS/dst)
    //   dengan bahan + warna + kuantitas. Struktur mirror wo_permintaan_gudang
    //   tapi TERPISAH — forecasting tidak mempengaruhi stok asli.
    //
    // Kalau stok bahan < kuantitas forecast → tampilkan warning di modal
    // + banner di menu Stok. Tapi tidak deduct dari stok sungguhan.
    name: '067_wo_forecast_bahan',
    up: [
      "CREATE TABLE IF NOT EXISTS `wo_forecast` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`work_order_id` INT UNSIGNED NOT NULL," +
        "`notes` TEXT NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE KEY `uniq_forecast_wo` (`work_order_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "CREATE TABLE IF NOT EXISTS `wo_forecast_bahan` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`work_order_id` INT UNSIGNED NOT NULL," +
        "`form_no` INT NOT NULL DEFAULT 1," +
        "`urutan` INT NOT NULL DEFAULT 0," +
        "`kategori` VARCHAR(50) NULL," +
        "`bagian` VARCHAR(100) NULL," +
        "`bahan` VARCHAR(255) NULL," +
        "`warna` VARCHAR(100) NULL," +
        "`kuantitas` DECIMAL(12,2) NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_forecast_bahan_wo` (`work_order_id`, `form_no`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Real Pengeluaran Bahan — actual pengeluaran bahan dari gudang per WO.
    // Beda dengan wo_forecast (perkiraan), wo_pengeluaran ini SUDAH deduct
    // stok. Setiap save bikin stok_adjustment row 'Keluar' untuk audit trail.
    //
    // wo_pengeluaran: 1 row per WO (header), UNIQUE work_order_id supaya
    //   satu WO cuma bisa punya 1 record pengeluaran final (bukan idempotent
    //   log — kalau edit, replace saja).
    // wo_pengeluaran_bahan: detail baris (bagian/bahan/warna/kuantitas).
    //   Struktur sama dengan wo_forecast_bahan supaya form template konsisten.
    name: '068_wo_pengeluaran_bahan',
    up: [
      "CREATE TABLE IF NOT EXISTS `wo_pengeluaran` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`work_order_id` INT UNSIGNED NOT NULL," +
        "`notes` TEXT NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE KEY `uniq_pengeluaran_wo` (`work_order_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "CREATE TABLE IF NOT EXISTS `wo_pengeluaran_bahan` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`work_order_id` INT UNSIGNED NOT NULL," +
        "`form_no` INT NOT NULL DEFAULT 1," +
        "`urutan` INT NOT NULL DEFAULT 0," +
        "`kategori` VARCHAR(50) NULL," +
        "`bagian` VARCHAR(100) NULL," +
        "`bahan` VARCHAR(255) NULL," +
        "`warna` VARCHAR(100) NULL," +
        "`kuantitas` DECIMAL(12,2) NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_pengeluaran_bahan_wo` (`work_order_id`, `form_no`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Pembelian Bahan — form permintaan barang dari tim Gudang yang
    // di-approve oleh Finance. Alur:
    //   1. Gudang isi form (nama pemohon, divisi, jabatan, alasan) +
    //      list barang (nama/qty/harga/jumlah). Submit → status='SUBMITTED'.
    //   2. Muncul di menu Finance → Pembelian Barang Gudang untuk review.
    //   3. Finance approve/reject. Kalau approve, status='APPROVED' + timestamp.
    //      Kalau reject, status='REJECTED' + finance_notes alasan.
    //   4. Gudang bisa lihat status di history.
    // Tidak nge-deduct atau add stok — cuma workflow approval finance.
    // Stok masuk baru di-input operator setelah barang fisik datang
    // (via menu Stok manual atau nanti auto-flow).
    name: '069_pembelian_bahan',
    up: [
      "CREATE TABLE IF NOT EXISTS `pembelian_bahan` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`no_formulir` VARCHAR(50) NULL," +
        "`tanggal` DATE NULL," +
        "`pemohon` VARCHAR(150) NULL," +
        "`divisi` VARCHAR(100) NULL," +
        "`jabatan` VARCHAR(100) NULL," +
        "`alasan` TEXT NULL," +
        "`total` BIGINT NOT NULL DEFAULT 0," +
        "`status` VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'," +
        "`finance_notes` TEXT NULL," +
        "`finance_at` TIMESTAMP NULL," +
        "`finance_by` VARCHAR(150) NULL," +
        "`created_by` VARCHAR(150) NULL," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_pb_status` (`status`)," +
        "KEY `idx_pb_created` (`created_at`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
      "CREATE TABLE IF NOT EXISTS `pembelian_bahan_item` (" +
        "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT," +
        "`pembelian_id` INT UNSIGNED NOT NULL," +
        "`urutan` INT NOT NULL DEFAULT 0," +
        "`nama_barang` VARCHAR(255) NULL," +
        "`jumlah_item` DECIMAL(12,2) NOT NULL DEFAULT 0," +
        "`satuan` VARCHAR(50) NULL," +
        "`harga` BIGINT NOT NULL DEFAULT 0," +
        "`total` BIGINT NOT NULL DEFAULT 0," +
        "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "PRIMARY KEY (`id`)," +
        "KEY `idx_pbi_pembelian` (`pembelian_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci",
    ],
  },
  {
    // Seed master barang dari daftar Accurate (2 batch: batch pertama
    // = accessories & logo, batch kedua = kain-kain). User request seed
    // hanya kode_barang + nama; harga/satuan/tipe/letak diisi manual
    // via menu Stok. Default letak = 'Gudang Ayres' (satu-satunya
    // gudang aktif). Migration 066 sebelumnya sudah clear barang table
    // jadi seed ini mulai dari kondisi kosong.
    name: '070_seed_barang_master_accurate',
    up: [
      // base schema barang.tipe_barang_id NOT NULL tanpa default → fail
      // untuk INSERT tanpa kolom itu. Ubah jadi NULLable dulu supaya seed
      // + form Data Barang (yang kirim tipe_barang_id=null saat jenis
      // belum dipilih) sama-sama jalan. Idempotent — MODIFY safe kalau
      // sudah NULL sebelumnya.
      "ALTER TABLE `barang` MODIFY COLUMN `tipe_barang_id` INT UNSIGNED NULL",
      "INSERT INTO `barang` (`kode_barang`, `nama`, `letak`) VALUES " +
        "('100923','AUTHENTIC 3D PRO CHAMELEON','Gudang Ayres')," +
        "('BB100270','AUTHENTIC WOVEN','Gudang Ayres')," +
        "('100873','CENTERFOLD WOVEN RETAIL','Gudang Ayres')," +
        "('100884','ELASTIC PANTS','Gudang Ayres')," +
        "('BB100707','KERAH RAJUT JACQUARD 3 PLY','Gudang Ayres')," +
        "('BB100703','LENGAN RAJUT JACQUARD 4 PLY','Gudang Ayres')," +
        "('BB100708','LIS LENGAN JACQUARD MAROON','Gudang Ayres')," +
        "('BB100622','LOGO AUTHENTIC NUSANTARA CHAMELEON','Gudang Ayres')," +
        "('BB100623','LOGO AUTHENTIC NUSANTARA WOVEN','Gudang Ayres')," +
        "('BB350','LOGO AYRES 3D WARNA HITAM BARU','Gudang Ayres')," +
        "('BB351','LOGO AYRES 3D WARNA PUTIH BARU','Gudang Ayres')," +
        "('BB100624','LOGO AYRES TIMBUL','Gudang Ayres')," +
        "('BB100625','LOGO RUBBER PSS','Gudang Ayres')," +
        "('BB100627','LOGO TIMNAS 3D','Gudang Ayres')," +
        "('100872','OUTER WOVEN RETAIL','Gudang Ayres')," +
        "('BB100628','RUBBER AUTHENTIC PSS','Gudang Ayres')," +
        "('BB100683','RUBBER GARUDA','Gudang Ayres')," +
        "('100864','RUBBER LOGO','Gudang Ayres')," +
        "('BB100629','RUBBER TIMBUL AUTHENTIC 3D PRO','Gudang Ayres')," +
        "('100871','SATIN AYRES RETAIL','Gudang Ayres')," +
        "('100870','SATIN SIZE RETAIL','Gudang Ayres')," +
        "('BB100621','SCORELAB PSS','Gudang Ayres')," +
        "('100853','SLIP AYRES PRO','Gudang Ayres')," +
        "('100836','TAFETA WASHTAG','Gudang Ayres')," +
        "('100863','TALI CELANA','Gudang Ayres')," +
        "('100860','TALI KERAH JERSEY','Gudang Ayres')," +
        "('100915','TATAMI LOKAL','Gudang Ayres')," +
        "('BB353','TULISAN AYRES 3D WARNA HITAM BARU','Gudang Ayres')," +
        "('BB352','TULISAN AYRES 3D WARNA PUTIH BARU','Gudang Ayres')," +
        "('BB100889','WEBBING','Gudang Ayres')," +
        // Kain-kain
        "('BB59','AIRWALK','Gudang Ayres')," +
        "('BB100269','AIRWALK HITAM','Gudang Ayres')," +
        "('100925','AIRWALK MAROON','Gudang Ayres')," +
        "('100842','ALPHINA PUTIH','Gudang Ayres')," +
        "('100944','ASMAT PUTIH','Gudang Ayres')," +
        "('BB100590','BABY TERY','Gudang Ayres')," +
        "('100943','BATIK PUTIH','Gudang Ayres')," +
        "('BB64','BENZEMA PUTIH','Gudang Ayres')," +
        "('244','BORKAS HITAM','Gudang Ayres')," +
        "('100945','BORNEO PUTIH','Gudang Ayres')," +
        "('BB164','BRAZIL ABU MUDA','Gudang Ayres')," +
        "('BB308','BRAZIL ABU TUA','Gudang Ayres')," +
        "('BB253','BRAZIL BENHUR','Gudang Ayres')," +
        "('100829','BRAZIL BIRU ITALY','Gudang Ayres')," +
        "('BB100769','BRAZIL BIRU LANGIT','Gudang Ayres')," +
        "('100764','BRAZIL COKLAT','Gudang Ayres')," +
        "('BB100763','BRAZIL CREAM','Gudang Ayres')," +
        "('BB279','BRAZIL FANTA','Gudang Ayres')," +
        "('BB176','BRAZIL HIJAU ARMY','Gudang Ayres')," +
        "('BB84','BRAZIL HIJAU BOTOL','Gudang Ayres')," +
        "('BB86','BRAZIL HIJAU FUJI','Gudang Ayres')," +
        "('BB100694','BRAZIL HIJAU STABILO','Gudang Ayres')," +
        "('BB329','BRAZIL KENARI','Gudang Ayres')," +
        "('100828','BRAZIL KUBUS 2','Gudang Ayres')," +
        "('BB149','BRAZIL MAROON (MERAH HATI)','Gudang Ayres')," +
        "('BB68','BRAZIL MERAH CABE','Gudang Ayres')," +
        "('100932','BRAZIL NATION','Gudang Ayres')," +
        "('BB71','BRAZIL NAVY','Gudang Ayres')," +
        "('BB69','BRAZIL ORANGE','Gudang Ayres')," +
        "('BB342','BRAZIL PINK BABY','Gudang Ayres')," +
        "('BB50','BRAZIL PUTIH','Gudang Ayres')," +
        "('BB142','BRAZIL TOSCA 1','Gudang Ayres')," +
        "('BB144','BRAZIL TOSCA TUA','Gudang Ayres')," +
        "('BB150','BRAZIL TURKIS','Gudang Ayres')," +
        "('BB85','BRAZIL UNGU','Gudang Ayres')," +
        "('BB264','BRAZIL UNGU NEW','Gudang Ayres')," +
        "('BB310','BRAZIL UNGU TUA','Gudang Ayres')," +
        "('100815','BRAZIL VIOLET','Gudang Ayres')," +
        "('BB55','BRICK PUTIH','Gudang Ayres')," +
        "('BB56','BRIKET PUTIH','Gudang Ayres')," +
        "('BB66','BUGGATI PUTIH','Gudang Ayres')," +
        "('100948','CENTURY ABU MUDA','Gudang Ayres')," +
        "('100947','CENTURY ABU TUA','Gudang Ayres')," +
        "('100946','CENTURY HITAM','Gudang Ayres')," +
        "('BB60','CORDOBA PUTIH','Gudang Ayres')," +
        "('100076','COTTON COMBED 24S HITAM','Gudang Ayres')," +
        "('100867','CRINKLE','Gudang Ayres')," +
        "('BB100781','D23 STABILO','Gudang Ayres')," +
        "('100748','D23/ELJA','Gudang Ayres')," +
        "('100868','DESPO','Gudang Ayres')," +
        "('BB287','DROPNEEDLE ABU TUA','Gudang Ayres')," +
        "('BB288','DROPNEEDLE BENHUR','Gudang Ayres')," +
        "('BB286','DROPNEEDLE HITAM','Gudang Ayres')," +
        "('BB289','DROPNEEDLE NAVY','Gudang Ayres')," +
        "('BB65','DROPNEEDLE PUTIH','Gudang Ayres')," +
        "('BB100221','DRYFIT CHEVRON PUTIH','Gudang Ayres')," +
        "('BB87','EMBOSS MIX','Gudang Ayres')," +
        "('BB62','EMBOSS STRAW','Gudang Ayres')," +
        "('BB57','EMBOSS TOPO PUTIH','Gudang Ayres')," +
        "('100988','ENGLAND PUTIH','Gudang Ayres')," +
        "('100949','HOLLAND PUTIH','Gudang Ayres')," +
        "('BB100281','JACQUARD ARMY PUTRA ANGGREK','Gudang Ayres')," +
        "('BB100677','JACQUARD DYNAMIC','Gudang Ayres')," +
        "('100876','JACQUARD ETNIK PUTIH','Gudang Ayres')," +
        "('100877','JACQUARD SPIDER PUTIH','Gudang Ayres')," +
        "('100878','JACQUARD UNO PUTIH','Gudang Ayres')," +
        "('BB63','JALA ERBIN','Gudang Ayres')," +
        "('100887','JALA ERBIN KUNING KENARI','Gudang Ayres')," +
        "('100885','JALA ERBIN MERAH CABE','Gudang Ayres')," +
        "('100886','JALA ERBIN TURKISH','Gudang Ayres')," +
        "('BB100684','KAIN TLP HITAM','Gudang Ayres')," +
        "('BB100685','KAIN TLP PUTIH','Gudang Ayres')," +
        "('BB100648','LIGHTNING PUTIH','Gudang Ayres')," +
        "('BB100588','LOTTO DONGKER','Gudang Ayres')," +
        "('BB96','LOTTO HITAM','Gudang Ayres')," +
        "('100977','LOTTO KUNING KENAR','Gudang Ayres')," +
        "('100846','LOTTO MERAH CABE','Gudang Ayres')," +
        "('BB95','LOTTO PUTIH','Gudang Ayres')," +
        "('100939','MICROTEX','Gudang Ayres')," +
        "('100848','MILANO BENHUR','Gudang Ayres')," +
        "('BB82','MILANO BIRU','Gudang Ayres')," +
        "('100809','MILANO BIRU LANGIT','Gudang Ayres')," +
        "('100914','MILANO FINISH PACIFIC','Gudang Ayres')," +
        "('BB81','MILANO HIJAU BOTOL','Gudang Ayres')," +
        "('100847','MILANO HIJAU FUJI','Gudang Ayres')," +
        "('BB77','MILANO HITAM','Gudang Ayres')," +
        "('BB79','MILANO KUNING','Gudang Ayres')," +
        "('BB78','MILANO MAROON','Gudang Ayres')," +
        "('100931','MILANO NATION','Gudang Ayres')," +
        "('BB334','MILANO NAVY','Gudang Ayres')," +
        "('BB83','MILANO ORANGE','Gudang Ayres')," +
        "('BB52','MILANO PUTIH','Gudang Ayres')," +
        "('100855','MILANO TOSCA BABY','Gudang Ayres')," +
        "('100849','MILANO TURQOISE','Gudang Ayres')," +
        "('BB54','MU PUTIH','Gudang Ayres')," +
        "('BB100784','PIQUE','Gudang Ayres')," +
        "('BB100586','PUMA PUTIH EVOTEX','Gudang Ayres')," +
        "('BB100687','RIB BARU','Gudang Ayres')," +
        "('100875','RIB COTTON COMBED','Gudang Ayres')," +
        "('BB100548','RIB HYGET PUTRA ANGGREK','Gudang Ayres')," +
        "('BB100674','SCUBA','Gudang Ayres')," +
        "('100851','SCUBA NAVY','Gudang Ayres')," +
        "('BB182','SERENA BIRU','Gudang Ayres')," +
        "('BB94','SEVILA/ WAFEL MINI MINI','Gudang Ayres')," +
        "('100958','SK630','Gudang Ayres')," +
        "('BB100673','SPANDEX VINTAGE','Gudang Ayres')," +
        "('BB93','TOPO BIRU','Gudang Ayres')," +
        "('BB92','TOPO HITAM','Gudang Ayres')," +
        "('BB91','TOPO MERAH','Gudang Ayres')," +
        "('BB340','TOPOGRAFH PUTIH JAGUARD','Gudang Ayres')," +
        "('100680','TRICOT SQUARE','Gudang Ayres')," +
        "('100926','VELVET','Gudang Ayres')," +
        "('BB100681','VICTORY PUTIH','Gudang Ayres')," +
        "('BB100667','WAFEL ABU TUA','Gudang Ayres')," +
        "('BB204','WAFEL TOSCA','Gudang Ayres')",
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
