-- Migration: cache server-rendered PDF pages as PNGs
-- On import we convert each PDF page to a PNG (pdf-to-img on the server)
-- so the spec viewer can display the page exactly as the source PDF,
-- including all embedded images — without browser PDF-viewer chrome and
-- without pdf.js missing some image filters.

ALTER TABLE `wo_spesifikasi`
  ADD COLUMN `imported_file_pages` TEXT NULL COMMENT 'JSON array of /uploads/*.png page paths';
