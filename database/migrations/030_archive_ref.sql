-- 030_archive_ref.sql
-- Référence stable pour les documents d'archive générés automatiquement
-- (ex. feuille d'émargement d'un dossier : ref = 'emarg:<enrollment_id>'),
-- afin de pouvoir les mettre à jour (upsert) à chaque nouvelle signature.
ALTER TABLE archive_document
    ADD COLUMN IF NOT EXISTS ref varchar(80) DEFAULT NULL AFTER organization_id;

ALTER TABLE archive_document
    ADD UNIQUE KEY IF NOT EXISTS uq_archdoc_ref (organization_id, ref);
