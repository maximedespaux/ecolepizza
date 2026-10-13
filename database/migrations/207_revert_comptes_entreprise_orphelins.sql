/*
  Revert de la 207 — il NE PEUT RIEN restaurer : les comptes supprimés étaient des logins ENTREPRISE
  ORPHELINS (plus aucune entreprise ni fiche ne les référençait), et un compte effacé ne se recrée
  pas à partir de rien (mot de passe, dates, identifiant perdus). On ne fait donc RIEN, exprès
  (DO 0), comme les autres nettoyages d'orphelins (cf. la 139).
*/
DO 0;
