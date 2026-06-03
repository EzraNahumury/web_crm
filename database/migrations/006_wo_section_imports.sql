-- Migration: generic per-section import storage for WO 2 / WO 3 / WO 4
-- Each WO can have one imported file per section. The original file is
-- kept; for Excel uploads we also store paths to rasterized PNG pages.

CREATE TABLE IF NOT EXISTS `wo_section_imports` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` INT UNSIGNED NOT NULL,
  `section` VARCHAR(20) NOT NULL COMMENT 'wo2 | wo3 | wo4',
  `imported_file` VARCHAR(500) NULL,
  `imported_file_name` VARCHAR(255) NULL,
  `imported_file_pages` TEXT NULL COMMENT 'JSON array of /uploads/*.png paths',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_wo_section` (`work_order_id`, `section`),
  KEY `fk_si_wo` (`work_order_id`),
  CONSTRAINT `fk_si_wo` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
