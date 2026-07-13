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
        const benign = /Duplicate column|already exists|Duplicate key|check that (column|it) exists|Can't DROP.*check that/i.test(msg);
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
