-- Migration: add paket column to wo_spesifikasi
-- Each spesifikasi sheet stores its own paket selection (chosen via
-- the dropdown in the Buat/Edit Lembar Spesifikasi drawer). When null,
-- the UI falls back to displaying the work order's paket.

ALTER TABLE `wo_spesifikasi`
  ADD COLUMN `paket` VARCHAR(100) NULL AFTER `nama_spesifikasi`;
