-- 077_company_documents.sql
-- Documents « entreprise » : un document généré une seule fois pour un groupe (entreprise +
-- session), qui LISTE tous les stagiaires envoyés par l'entreprise (jeton {Stagiaires}), au
-- lieu d'un document par stagiaire. Le document reste rattaché à toutes les inscriptions du
-- groupe via document_formation (déjà multi-inscriptions).
ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS scope ENUM('LEARNER','COMPANY') NOT NULL DEFAULT 'LEARNER',
    ADD COLUMN IF NOT EXISTS company_id CHAR(36) NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS session_id CHAR(36) NULL DEFAULT NULL;

-- Un modèle marqué « entreprise » est produit une fois par groupe (et non par stagiaire).
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS company_level TINYINT(1) NOT NULL DEFAULT 0;
