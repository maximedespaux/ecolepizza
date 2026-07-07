-- ============================================================================
--  Migration 008 — Détails pédagogiques des formations (édition depuis l'app)
--  Ajoute les champs affichés/édités sur la page Formations :
--    · objective_general — « ObjectifG » (objectif général)
--    · duration_detail   — « DuréeDétail » (horaires par jour)
--    · program_detail    — « Déroulé » (programme jour par jour, texte long)
--  Et élargit `audience` (« Public ») en TEXT (certaines descriptions dépassent 255).
--    mysql -u root -p gds_doc_gestionary < database/migrations/008_program_details.sql
-- ============================================================================

ALTER TABLE training_program
  MODIFY     audience          text        DEFAULT NULL,
  ADD COLUMN objective_general text        DEFAULT NULL AFTER objectives,
  ADD COLUMN duration_detail   text        DEFAULT NULL AFTER objective_general,
  ADD COLUMN program_detail    longtext    DEFAULT NULL AFTER duration_detail;
