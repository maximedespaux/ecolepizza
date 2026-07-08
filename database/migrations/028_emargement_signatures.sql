-- 028_emargement_signatures.sql
-- Signature électronique de l'émargement : chaque stagiaire signe sa présence
-- par demi-journée (depuis son espace), et le formateur signe la feuille.
ALTER TABLE attendance_record
    ADD COLUMN IF NOT EXISTS signer_name    varchar(255) DEFAULT NULL AFTER present,
    ADD COLUMN IF NOT EXISTS signature_data longtext     DEFAULT NULL AFTER signer_name;

ALTER TABLE attendance_sheet
    ADD COLUMN IF NOT EXISTS trainer_name      varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS trainer_signature longtext     DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS trainer_signed_at datetime     DEFAULT NULL;
