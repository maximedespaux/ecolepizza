-- 099_template_avail_phase.sql
-- Disponibilité d'un modèle de document selon l'avancement de la formation :
--   NULL / 'any' = toujours · 'during' = une fois la session commencée · 'end' = une
--   fois la session terminée. Remplace le classement CODÉ EN DUR par type (certificat,
--   diplôme…). NULL conserve l'ancien comportement (repli par type côté application).
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS avail_phase VARCHAR(12) DEFAULT NULL AFTER signers;
