/* 161_revert_remise_sans_objet.sql
   Retire l'exclusion « sans objet » des remises.

   ⚠️ PERTE DE DONNEES : les exclusions decidees au cas par cas disparaissent, et les etapes
   concernees redeviennent dues pour tout le monde. Les dossiers qui affichaient cent pour cent
   retomberont en dessous, sans que rien n'explique pourquoi.

   `IF EXISTS` -> rejouable sans risque. */

ALTER TABLE remise_document
    DROP COLUMN IF EXISTS sans_objet;
