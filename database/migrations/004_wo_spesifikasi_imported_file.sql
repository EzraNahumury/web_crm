-- Migration: store the imported spec file (Excel / PDF) on wo_spesifikasi
-- WO 1 is now populated by importing a file instead of filling the
-- "Buat Lembar Spesifikasi" form by hand. The original file is kept
-- so the spec card can render it (PDF in an iframe, Excel via SheetJS).

ALTER TABLE `wo_spesifikasi`
  ADD COLUMN `imported_file` LONGTEXT NULL COMMENT 'data URL of imported Excel / PDF',
  ADD COLUMN `imported_file_name` VARCHAR(255) NULL;
