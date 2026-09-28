/*
  187_revert_moyens_paiement.sql

  CE QUI SE PERD : la liste des moyens de paiement telle que l'école l'a tenue dans Facturation —
  les moyens ajoutés, renommés ou retirés, leur ordre, et le modèle de facture de chacun.

  La caisse et la facturation des demandes reviennent aux listes d'AVANT, restées intactes sur les
  entités émettrices et les réglages boutique : un moyen ajouté depuis n'y figure pas. Plus aucun
  modèle n'est pré-sélectionné ; il se choisit à la main, comme avant.

  Les factures déjà émises ne perdent rien : elles portent le NOM du moyen et leur modèle, figés à
  l'émission.
*/

DROP TABLE IF EXISTS moyen_paiement;
