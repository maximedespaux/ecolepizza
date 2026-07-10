-- 059_drop_legacy_tables.sql
-- Suppression des tables de l'ANCIEN modèle de données (pré-refonte), devenues
-- inutilisées : le code actuel s'appuie sur organization / training_program /
-- training_session / generated_document / document_template… qui ont remplacé
-- formation_center / formation_program / document / signing, etc.
--
-- Vérifié avant suppression :
--   • aucune requête du backend (src/api) ne référence ces tables ;
--   • aucune table active n'a de clé étrangère pointant vers elles
--     (leurs FK ne partent que d'elles-mêmes vers company/user, supprimées avec).
--
-- ⚠ IRRÉVERSIBLE : ces tables et leur contenu seront définitivement supprimés.
--   Faites une SAUVEGARDE COMPLÈTE de la base avant d'exécuter ce script.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS calendar;
DROP TABLE IF EXISTS financer;
DROP TABLE IF EXISTS document;
DROP TABLE IF EXISTS formation_program;
DROP TABLE IF EXISTS formation_content;
DROP TABLE IF EXISTS company_user;
DROP TABLE IF EXISTS formation_center_user;
DROP TABLE IF EXISTS formation_center;
DROP TABLE IF EXISTS signing;

SET FOREIGN_KEY_CHECKS = 1;
