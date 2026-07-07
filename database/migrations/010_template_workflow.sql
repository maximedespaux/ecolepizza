-- ============================================================================
--  Migration 010 — Workflow documentaire piloté par les données
--  Chaque organisme peut composer son propre jeu de documents (les « étapes »
--  du dossier) : intitulé, position, signature, conditions d'application, fichier.
--
--  document_template gagne les métadonnées d'étape ; le fichier .docx devient
--  facultatif (une étape peut être une simple pièce à suivre, sans modèle).
--  generated_document.type passe en varchar (types personnalisés possibles) et
--  reçoit template_slug (quel modèle a produit le document).
--    mysql -u root -p gds_doc_gestionary < database/migrations/010_template_workflow.sql
-- ============================================================================

ALTER TABLE document_template
  MODIFY     file            longblob     DEFAULT NULL,           -- facultatif (étape sans modèle)
  ADD COLUMN label           varchar(255) DEFAULT NULL AFTER slug,
  ADD COLUMN doc_type        varchar(40)  DEFAULT NULL AFTER label,   -- type du generated_document (DEVIS, CONTRAT…)
  ADD COLUMN sort_order      int          NOT NULL DEFAULT 100 AFTER doc_type,
  ADD COLUMN signable        tinyint(1)   NOT NULL DEFAULT 0 AFTER sort_order,
  ADD COLUMN stagiaire_sign  tinyint(1)   NOT NULL DEFAULT 0 AFTER signable,
  ADD COLUMN applies_when    longtext     DEFAULT NULL AFTER stagiaire_sign,  -- JSON {financing?,rs?,hygiene?,jours?}
  ADD COLUMN active          tinyint(1)   NOT NULL DEFAULT 1 AFTER applies_when;

ALTER TABLE generated_document
  MODIFY     type            varchar(40)  NOT NULL,
  ADD COLUMN template_slug   varchar(60)  DEFAULT NULL AFTER type;
