/*
  LE NUMÉRO DE CERTIFICATION d'un dossier (demandé le 2026-10-12).

  POURQUOI. Une formation CERTIFIANTE (elle a un code RS) délivre un parchemin qui porte un
  NUMÉRO UNIQUE par certifié — le numéro qui figure sur le diplôme. Rien ne le gardait. On le
  pose sur l'INSCRIPTION (`enrollment`) : c'est « ce stagiaire, pour cette formation » — donc
  lié au stagiaire dans le contexte d'une formation, et réutilisable pour TOUTE formation
  certifiante, pas seulement la RS7404.

  COMMENT. Attribué AUTOMATIQUEMENT à la clôture du jury, aux candidats admis (décision CERTIFIÉ
  ou BLOCS ACQUIS), en une séquence SIMPLE par organisme (1, 2, 3…), puis modifiable à la main
  depuis l'écran de la commission. Unique par organisme : deux parchemins ne portent jamais le
  même numéro (le serveur refuse un doublon).

  Entier, facultatif. Le code marche AVANT comme APRÈS la migration : sans la colonne, le jeton
  {Numéro de certification} sort vide, la clôture n'attribue rien, et l'écran de commission ne
  propose pas le champ (503 si l'on tente de l'écrire). Rejouable sans risque (IF NOT EXISTS).
*/
ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS numero_certification INT NULL;
