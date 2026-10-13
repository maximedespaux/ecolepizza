/*
  Revert de la 206 — il NE PEUT PAS restaurer l'état d'avant : on ne sait plus quelles fiches
  étaient privées (la visibilité d'origine n'est conservée nulle part). Repasser TOUT en privé
  cacherait aussi les fiches volontairement partagées, de longue date. On ne fait donc RIEN,
  exprès (DO 0), comme les autres migrations de données à sens unique (cf. 171, 183).

  Pour re-privatiser une fiche précise, utiliser le « Retirer du fil » de la Communauté
  (modération), fiche par fiche.
*/
DO 0;
