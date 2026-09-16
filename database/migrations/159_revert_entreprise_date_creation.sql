/* 159_revert_entreprise_date_creation.sql
   Retire la date de creation des entreprises.

   ⚠️ PERTE DE DONNEES : chaque date saisie a la main est perdue, et rien ne permet de la
   retrouver — `created_at` ne la remplace pas, c'est justement tout le propos de la 159.
   Ne jouer ce revert que si la 159 vient d'etre jouee par erreur.

   `IF EXISTS` -> rejouable sans risque. */

ALTER TABLE company
    DROP COLUMN IF EXISTS date_creation;
