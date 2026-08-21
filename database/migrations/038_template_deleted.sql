-- 038_template_deleted.sql
-- Permet de supprimer DÉFINITIVEMENT un modèle du socle (pas seulement le
-- désactiver). Les étapes par défaut sont définies dans le code ; un « tombstone »
-- (deleted=1) en base masque définitivement l'étape pour cet organisme.
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS deleted tinyint(1) NOT NULL DEFAULT 0;
