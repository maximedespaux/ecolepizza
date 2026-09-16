/* 157_revert_document_session_externe.sql

   ⚠ LES DOCUMENTS DE SESSION DEVIENNENT ILLISIBLES POUR L'APPLICATION avant d'être perdus :
   MySQL refuse de rétrécir l'énumération tant qu'une ligne porte 'SESSION', et les ramener à
   'LEARNER' en ferait des documents sans stagiaire — visibles nulle part.

   Relever puis traiter AVANT de reverter :
     SELECT id, title, session_id FROM generated_document WHERE scope = 'SESSION';
   Puis, en connaissance de cause :
     DELETE FROM generated_document WHERE scope = 'SESSION';  -- ou les rattacher à la main */

ALTER TABLE generated_document
    DROP INDEX IF EXISTS idx_doc_session_scope;

ALTER TABLE generated_document
    MODIFY COLUMN scope ENUM('LEARNER','COMPANY') NOT NULL DEFAULT 'LEARNER';
