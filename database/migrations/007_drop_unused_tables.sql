-- ============================================================================
--  Migration 007 — Nettoyage : suppression des tables inutilisées
--  Ces tables existaient dans le schéma initial (héritage de la fondation
--  Prisma d'ecolepizza) mais AUCUNE n'est utilisée par le code de l'API :
--    · document_template    — les documents sont générés par règles (lib/documents.js),
--                             pas depuis un modèle stocké.
--    · signature_request    — la signature se fait par tracé stocké sur
--    · signature_recipient    generated_document.signature_data (cf. 05_SIGNATURE.md).
--    · evaluation           — pas d'endpoint d'évaluation.
--    · qualiopi_evidence    — le suivi calcule la conformité depuis les documents.
--    · partner_contract     — l'annuaire n'utilise que la table partner.
--
--  Sauvegardez avant d'exécuter (les tables et leurs données seront supprimées) :
--    mysqldump -u root -p gds_doc_gestionary > sauvegarde_avant_007.sql
--    mysql    -u root -p gds_doc_gestionary < database/migrations/007_drop_unused_tables.sql
-- ============================================================================

-- 1. Retirer la dépendance de generated_document vers document_template.
--    (colonne template_id toujours NULL : jamais renseignée par l'application)
ALTER TABLE generated_document DROP FOREIGN KEY fk_doc_template;
ALTER TABLE generated_document DROP COLUMN template_id;

-- 2. Supprimer les tables inutilisées (enfant avant parent pour les FK).
DROP TABLE IF EXISTS signature_recipient;
DROP TABLE IF EXISTS signature_request;
DROP TABLE IF EXISTS evaluation;
DROP TABLE IF EXISTS qualiopi_evidence;
DROP TABLE IF EXISTS partner_contract;
DROP TABLE IF EXISTS document_template;
