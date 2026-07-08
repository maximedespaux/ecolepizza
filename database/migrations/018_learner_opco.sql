-- 018_learner_opco.sql
-- OPCO / financeur du stagiaire (AGEFICE, AKTO, FIF PL…). Sert aux conditions
-- documentaires (ex. Attestation d'assiduité si AGEFICE). Idempotent.

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS opco varchar(120) DEFAULT NULL AFTER financing;
