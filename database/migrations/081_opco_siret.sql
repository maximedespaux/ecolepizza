-- 081_opco_siret.sql
-- Les financeurs (OPCO, France Travail…) ont leur PROPRE SIRET, distinct de celui de
-- l'organisme. On l'ajoute au référentiel OPCO pour l'imprimer sur les conventions /
-- documents financés (jeton « SIRET financeur »).
ALTER TABLE opco
    ADD COLUMN IF NOT EXISTS siret VARCHAR(20) NULL DEFAULT NULL;
