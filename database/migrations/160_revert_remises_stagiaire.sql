/* 160_revert_remises_stagiaire.sql
   Retire les remises de l'organisme au stagiaire.

   ⚠️ PERTE DE DONNEES IRREVERSIBLE : les fichiers remis et les ACCUSES DE RECEPTION
   disparaissent. L'accuse est une preuve de remise opposable lors d'un controle Qualiopi ;
   rien ne permettra de le reconstituer. Ne jouer ce revert que si la 160 vient d'etre jouee
   par erreur, avant toute remise reelle.

   Ordre INVERSE de la creation : les fichiers d'abord (ils referencent la remise), la remise
   ensuite (elle reference le type), le type en dernier. `IF EXISTS` -> rejouable. */

ALTER TABLE program_step DROP COLUMN IF EXISTS remise_id;
DROP TABLE IF EXISTS remise_fichier;
DROP TABLE IF EXISTS remise_document;
DROP TABLE IF EXISTS remise_type;
