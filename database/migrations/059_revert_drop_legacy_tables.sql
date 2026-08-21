-- 059_revert_drop_legacy_tables.sql — ROLLBACK MANUEL.
-- Recrée UNIQUEMENT la STRUCTURE des tables héritées (le CONTENU n'est pas
-- récupérable par ce script : restaurez-le depuis votre sauvegarde si besoin).
-- Les clés étrangères / index d'origine ne sont pas rejoués (tables obsolètes).

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `signing` (
  `id` int(10) UNSIGNED NOT NULL,
  `svg` blob DEFAULT NULL,
  `vector` mediumblob DEFAULT NULL,
  `created_at` date DEFAULT NULL,
  `updated_at` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `formation_center` (
  `id` uuid NOT NULL DEFAULT uuid(),
  `name` varchar(100) NOT NULL,
  `siret` varchar(20) NOT NULL,
  `zip_code` varchar(10) NOT NULL,
  `town` varchar(100) NOT NULL,
  `email` char(128) NOT NULL,
  `address` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `naf_code` varchar(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `signing_id` int(10) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `formation_center_user` (
  `id` int(11) NOT NULL,
  `formation_center_id` uuid NOT NULL DEFAULT uuid(),
  `user_id` uuid NOT NULL DEFAULT uuid(),
  `role` enum('admin','employee','client') NOT NULL DEFAULT 'client'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `company_user` (
  `id` int(11) NOT NULL,
  `company_id` uuid NOT NULL DEFAULT uuid(),
  `user_id` uuid NOT NULL DEFAULT uuid(),
  `role` enum('admin','employee') NOT NULL,
  `status` enum('CDD','CDI') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `formation_content` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` char(64) DEFAULT NULL,
  `duration` smallint(5) UNSIGNED DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `formation_center_id` uuid DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `formation_program` (
  `id` int(10) UNSIGNED NOT NULL,
  `formation_content_id` int(10) UNSIGNED NOT NULL,
  `unit_type` enum('day','week','year') NOT NULL,
  `unit_number` smallint(5) UNSIGNED NOT NULL,
  `description` text NOT NULL,
  `start_at` char(16) DEFAULT NULL,
  `end_at` char(16) DEFAULT NULL,
  `program` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `document` (
  `id` int(10) NOT NULL,
  `name` char(64) DEFAULT NULL,
  `content` mediumblob NOT NULL,
  `user_id` uuid DEFAULT uuid(),
  `company_id` uuid DEFAULT uuid(),
  `formation_center_id` uuid DEFAULT uuid(),
  `is_template` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` date NOT NULL DEFAULT current_timestamp(),
  `updated_at` date NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `financer` (
  `id` int(11) NOT NULL,
  `name` enum('FAFCEA') NOT NULL,
  `file_number` char(255) DEFAULT NULL,
  `company_user_id` int(11) NOT NULL,
  `formation_center_user_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `calendar` (
  `id` int(10) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `formation_content_id` int(10) UNSIGNED NOT NULL,
  `user_id` uuid DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
