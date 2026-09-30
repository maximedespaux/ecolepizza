/* 195_revert_reglement_moyen_paiement.sql

   Revert de la 195 : retire les quatre colonnes du moyen de paiement du règlement. Les montants et
   les dates de paiement (migration 194) restent ; seuls le moyen (espèces / chèque / virement / carte)
   et les références (n° de chèque, référence de virement) sont perdus. Sans risque à rejouer. */

ALTER TABLE enrollment
    DROP COLUMN IF EXISTS acompte_moyen,
    DROP COLUMN IF EXISTS acompte_ref,
    DROP COLUMN IF EXISTS solde_moyen,
    DROP COLUMN IF EXISTS solde_ref;
