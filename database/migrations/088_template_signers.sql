-- 088_template_signers.sql
-- NOUVEAU MODÈLE DE SIGNATURE (rework). Chaque modèle porte la LISTE de ses signataires
-- requis, qui remplace les anciens drapeaux signable / stagiaire_sign / company_sign.
-- Valeurs possibles : 'ORG', 'STAGIAIRE', 'ENTREPRISE', 'EXTERNAL'.
--   · Les parties (STAGIAIRE / ENTREPRISE / EXTERNAL) signent d'abord ;
--   · l'ORGANISME (ORG) contresigne en DERNIER (automatiquement) ;
--   · un document est « signé » quand TOUS les signataires requis ont signé.
-- Phase 1 : on AJOUTE la colonne et on REPREND les anciens drapeaux. Les anciennes
-- colonnes restent en place (retirées dans une migration ultérieure une fois le
-- nouveau moteur validé) : cette migration ne change AUCUN comportement.
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS signers JSON DEFAULT NULL AFTER company_level;

-- Reprise des anciens drapeaux -> nouvelle liste (idempotent).
UPDATE document_template SET signers = JSON_ARRAY() WHERE signers IS NULL;
UPDATE document_template SET signers = JSON_ARRAY_APPEND(signers, '$', 'ORG')
    WHERE signable = 1 AND NOT JSON_CONTAINS(signers, '"ORG"', '$');
UPDATE document_template SET signers = JSON_ARRAY_APPEND(signers, '$', 'STAGIAIRE')
    WHERE stagiaire_sign = 1 AND NOT JSON_CONTAINS(signers, '"STAGIAIRE"', '$');
UPDATE document_template SET signers = JSON_ARRAY_APPEND(signers, '$', 'ENTREPRISE')
    WHERE company_sign = 1 AND NOT JSON_CONTAINS(signers, '"ENTREPRISE"', '$');
