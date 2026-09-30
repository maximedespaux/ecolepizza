/* 194_revert_enrollment_reglement.sql

   Revert de 194 : retire les deux dates de règlement cochées à la main sur `enrollment`.

   Ce qui se perd : uniquement les « payé le … » saisis À LA MAIN (acompte et solde). Les paiements
   portés par des FACTURES ne sont pas touchés — ils vivent dans `payment`, et la carte « Règlement »
   les relira. La colonne `acompte` (le montant convenu) n'est PAS retirée : elle préexiste à la 194
   et sert ailleurs (jetons {Acompte} / {Reste à payer}). */

ALTER TABLE enrollment
    DROP COLUMN IF EXISTS acompte_paye_le,
    DROP COLUMN IF EXISTS solde_paye_le;
