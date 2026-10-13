/*
  NETTOYER LES COMPTES « ENTREPRISE » ORPHELINS (demandé le 2026-10-14).

  POURQUOI. Supprimer une entreprise ne supprimait PAS le compte de connexion de son REPRÉSENTANT
  (rôle ENTREPRISE) : il restait orphelin, réservait son e-mail, et empêchait d'en faire un compte
  stagiaire (« Cette adresse appartient déjà à un compte non-stagiaire : impossible de le
  réinitialiser ici. »). Le code est corrigé — `deleteCompany` nettoie désormais le représentant
  quand plus rien ne s'y rattache — mais les orphelins DÉJÀ créés restent en base.

  CE QUE FAIT LA MIGRATION. Elle retire les comptes de rôle ENTREPRISE qu'AUCUNE entreprise ne
  référence (`company.user_id`) et qu'AUCUNE fiche stagiaire ne référence (`learner.user_id`) :
  des logins morts, que plus aucun écran ne gère. C'est le même geste que la migration 139 pour les
  comptes STAGIAIRE orphelins. `NOT EXISTS` (et non `NOT IN`) pour rester juste si un `user_id` est
  NULL quelque part. Un compte ENTREPRISE encore rattaché à une entreprise n'est jamais touché.

  Après elle, l'e-mail d'un ancien représentant redevient libre pour un compte stagiaire.
*/
DELETE u FROM user u
 WHERE u.role = 'ENTREPRISE'
   AND NOT EXISTS (SELECT 1 FROM company c  WHERE c.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM learner l WHERE l.user_id = u.id);
