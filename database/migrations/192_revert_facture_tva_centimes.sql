/*
  192_revert_facture_tva_centimes.sql

  ⚠️ CELUI-CI N'EST PAS ANODIN, pour la même raison que le revert de la 108. Retirer la colonne fait
  repasser TOUTES les factures à l'ancien calcul, celles créées depuis la migration comprises. Une
  facture émise entre-temps dont la TVA tombait sur un demi-centime (plusieurs lignes d'un même taux
  de 2,1, 5,5 ou 10 %) se réimprimerait avec un centime DE MOINS que l'exemplaire remis au client.

  Rejouer ensuite la 192 ne réparerait rien : la colonne reviendrait à 0 pour toutes, et ces
  factures garderaient l'ancien calcul. À ne jouer que si la 192 vient d'être passée et qu'aucune
  facture n'a été créée depuis. Au-delà, préférer corriger le code plutôt que de retirer la donnée.
*/

ALTER TABLE invoice
    DROP COLUMN IF EXISTS tva_centimes;
