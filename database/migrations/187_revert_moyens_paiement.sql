/*
  187_revert_moyens_paiement.sql

  187 EST ABANDONNÉE — à jouer SEULEMENT si 187_moyens_paiement.sql a été jouée.

  La 187 créait la table `moyen_paiement` : une liste des moyens de paiement dans Paramètres →
  Facturation, chacun avec un modèle de facture pré-sélectionné à la caisse (PR #228, fusionnée et
  déployée le 2026-09-28). Ce n'était pas la demande : elle portait sur la page /factures (choisir le
  modèle et le règlement en créant un document). Le code a été retiré par la PR suivante ; son fichier
  ALLER a été supprimé, seul ce revert subsiste — même sort que la 124.

  CE QUI SE PERD : la liste tenue dans la carte « Moyens de paiement » depuis son déploiement, et le
  modèle attaché à chaque moyen. Plus rien ne la lit : la caisse et les demandes boutique proposent de
  nouveau les moyens des entités émettrices, restés intacts. Les factures émises entre-temps ne perdent
  rien — elles portent le NOM du moyen et leur modèle, figés à l'émission.

  Sans risque à ne pas jouer si la 187 ne l'a jamais été : `IF EXISTS`.
*/

DROP TABLE IF EXISTS moyen_paiement;
