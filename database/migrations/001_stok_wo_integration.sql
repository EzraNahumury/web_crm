-- ============================================
-- Migration 001: Integrasi Stok ↔ Work Order
-- Tanggal: 2026-04-29
-- ============================================
-- Menghubungkan modul Stok dengan Work Order.
-- Ketika tahap "Fabric Cutting" (Potong Kain) diselesaikan,
-- sistem otomatis memotong stok berdasar isi wo_permintaan_gudang.
-- ============================================

USE `ayres_crm`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) wo_permintaan_gudang: tambah barang_id (FK ke barang) + deducted_at (idempotency)
ALTER TABLE `wo_permintaan_gudang`
  ADD COLUMN `barang_id` INT UNSIGNED NULL AFTER `bahan`,
  ADD COLUMN `deducted_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Waktu stok dipotong (NULL = belum dipotong)' AFTER `kuantitas`,
  ADD KEY `fk_pg_barang` (`barang_id`),
  ADD CONSTRAINT `fk_pg_barang` FOREIGN KEY (`barang_id`) REFERENCES `barang`(`id`) ON DELETE SET NULL;

-- 2) stok_adjustment: tambah work_order_id (FK ke work_orders) + extend ENUM tipe
ALTER TABLE `stok_adjustment`
  MODIFY COLUMN `tipe` ENUM('Penambahan','Pengurangan','Koreksi','Pemakaian_WO') NOT NULL,
  ADD COLUMN `work_order_id` INT UNSIGNED NULL AFTER `keterangan`,
  ADD KEY `fk_sa_wo` (`work_order_id`),
  ADD CONSTRAINT `fk_sa_wo` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;
