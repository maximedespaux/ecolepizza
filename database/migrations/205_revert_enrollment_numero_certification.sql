/*
  Revert de la 205 : on retire le numéro de certification des dossiers.

  Les numéros attribués sont perdus ; les parchemins DÉJÀ imprimés gardent le leur (le PDF signé
  est figé, il ne se régénère pas). Le jeton {Numéro de certification} redevient vide partout, et
  l'écran de commission cesse de proposer le champ. Sans autre effet. Rejouable (IF EXISTS).
*/
ALTER TABLE enrollment DROP COLUMN IF EXISTS numero_certification;
