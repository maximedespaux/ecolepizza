/* CE QUI SE PERD : la date de désactivation en attente des profils qui l'avaient demandée — leur
   demande est simplement oubliée, et PLUS AUCUNE donnée n'est supprimée (le passage ne trouve plus
   la colonne). Les comptes DÉJÀ purgés restent désactivés (active = 0) et vidés : le revert ne leur
   rend pas leurs données. */
ALTER TABLE user DROP COLUMN IF EXISTS deactivated_at;
