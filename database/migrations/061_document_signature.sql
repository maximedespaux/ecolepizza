-- 061_document_signature.sql
-- Signatures multiples par document : un emplacement (« slot », jeton sig:<slot>)
-- par signataire (jury, stagiaires, formateur…), chacun signé indépendamment
-- depuis le compte de la personne. Complète les colonnes stagiaire/organisme
-- déjà présentes sur generated_document.
CREATE TABLE IF NOT EXISTS document_signature (
    id                uuid          NOT NULL DEFAULT uuid(),
    organization_id   uuid          NOT NULL,
    document_id       uuid          NOT NULL,             -- generated_document
    slot              varchar(60)   NOT NULL,             -- clé du jeton sig:<slot>
    label             varchar(120)  DEFAULT NULL,         -- libellé affiché (« Jury 1 »…)
    sort_order        int           DEFAULT 100,
    user_id           uuid          DEFAULT NULL,         -- signataire attribué (compte)
    signer_name       varchar(255)  DEFAULT NULL,
    signature_data    longtext      DEFAULT NULL,         -- image de signature (chiffrée)
    signer_ip         varchar(255)  DEFAULT NULL,
    signer_user_agent varchar(1000) DEFAULT NULL,
    signed_hash       char(64)      DEFAULT NULL,
    signed_at         datetime      DEFAULT NULL,
    created_at        timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_docsig (document_id, slot),
    KEY idx_docsig_org (organization_id),
    KEY idx_docsig_user (user_id),
    CONSTRAINT fk_docsig_doc FOREIGN KEY (document_id) REFERENCES generated_document (id) ON DELETE CASCADE,
    CONSTRAINT fk_docsig_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
