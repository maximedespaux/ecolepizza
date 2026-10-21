/*
  REVERT DE LA 214 : remettre l'OPCO en suffixe du titre des documents de groupe.

  Réversible parce que l'OPCO est toujours stocké (colonne `generated_document.opco`). On ré-ajoute
  « — <OPCO> » aux documents de groupe qui ne le portent pas déjà.

  ⚠️ PERTE ASSUMÉE : un document de groupe CRÉÉ APRÈS le déploiement du nouveau code (donc sans
  suffixe, volontairement) recevra lui aussi le suffixe — le revert ne sait pas distinguer « n'a
  jamais eu de suffixe » de « suffixe retiré par la 214 ». Il rétablit l'ancienne règle « tout
  document de groupe à OPCO porte son OPCO dans le titre », soit le comportement d'avant la 214.
*/

UPDATE generated_document
   SET title = CONCAT(title, ' — ', opco)
 WHERE scope = 'COMPANY'
   AND opco IS NOT NULL AND opco <> ''
   AND RIGHT(title, CHAR_LENGTH(CONCAT(' — ', opco))) <> CONCAT(' — ', opco);
