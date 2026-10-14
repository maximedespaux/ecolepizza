/*
  LES ALLERGÈNES D'UNE FICHE TECHNIQUE (demandé le 2026-10-14).

  Une colonne `recipe.allergens` (texte) : la liste JSON des codes d'allergènes PROPRES à la fiche
  (parmi les 14 réglementaires, cf. lib/allergenes.js), p. ex. `["gluten","lait"]`. Une réalisation
  HÉRITE en plus, à l'affichage, des allergènes des empâtements / préparations qu'elle importe — cela
  se calcule à la volée (non stocké), pour suivre toute évolution d'un composant.

  Le code marche AVANT comme APRÈS : sans la colonne, la lecture rend `allergens` = NULL (via
  `colonneOuNull`), l'écran n'affiche aucun allergène, et l'enregistrement les écrit à part, en
  try/catch — rien ne casse. Rejouable sans risque.
*/
ALTER TABLE recipe ADD COLUMN IF NOT EXISTS allergens TEXT DEFAULT NULL;
