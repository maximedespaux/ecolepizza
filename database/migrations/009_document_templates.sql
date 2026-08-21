-- ============================================================================
--  Migration 009 — Modèles de documents par organisme (multi-tenant)
--  Chaque organisme peut téléverser ses propres modèles Word (.docx) avec sa
--  charte / son logo. La génération utilise le modèle de l'organisme s'il existe,
--  sinon le modèle par défaut fourni avec l'application (src/api/templates).
--  Le fichier est identifié par un « slug » (ex. devis-particulier, contrat,
--  emargement-5j…) — voir src/api/lib/docxfill.js (TEMPLATE_SLUGS).
--    mysql -u root -p gds_doc_gestionary < database/migrations/009_document_templates.sql
--  NB : si votre serveur MySQL limite la taille des paquets, autorisez ≥ 16 Mo :
--    SET GLOBAL max_allowed_packet = 33554432;  (ou dans my.cnf)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_template (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    slug             varchar(60)  NOT NULL,          -- identifiant du modèle (devis-particulier…)
    name             varchar(255) DEFAULT NULL,      -- nom de fichier d'origine
    mime             varchar(120) DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file             longblob     NOT NULL,          -- contenu .docx
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_tpl_org_slug (organization_id, slug),
    CONSTRAINT fk_tpl_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
