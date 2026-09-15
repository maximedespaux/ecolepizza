/* 154_revert_archives_classeurs.sql

   ⚠ CE REVERT PERD LE RANGEMENT, PAS LES DOCUMENTS. Les PDF rangés en classeur restent dans
   `archive_document`, toujours chiffrés — mais sans la colonne ils n'ont plus ni année ni
   semaine, et retombent donc dans « Sans session » de l'année « - ». Ils sont retrouvables,
   pas perdus ; simplement rangés là où le coffre met ce qu'il ne sait pas dater.

   Si l'on veut les sortir AVANT de reverter, les supprimer depuis Suivi → Archives, ou relever
   leurs identifiants :
     SELECT id, dossier, title FROM archive_document WHERE dossier IS NOT NULL; */

ALTER TABLE archive_document
    DROP INDEX IF EXISTS idx_archdoc_dossier;

ALTER TABLE archive_document
    DROP COLUMN IF EXISTS dossier;
