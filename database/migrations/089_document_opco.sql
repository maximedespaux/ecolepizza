-- 089_document_opco.sql
-- Documents COLLECTIFS (entreprise) groupés par OPCO : un document par (entreprise,
-- OPCO, session). `opco` porte la clé du groupe (nom de l'OPCO ; NULL = sans OPCO).
-- Le jeton {Stagiaires} ne liste alors que les stagiaires de CET OPCO.
ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS opco VARCHAR(120) DEFAULT NULL AFTER session_id;
