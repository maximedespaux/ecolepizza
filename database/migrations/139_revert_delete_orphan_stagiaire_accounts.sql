/* Revert de 139 : IMPOSSIBLE de restaurer des comptes supprimés — no-op documenté.

   La 139 supprime des comptes STAGIAIRE ORPHELINS (aucune fiche, aucune entreprise) : des comptes
   morts qui ne servaient plus qu'à réserver leur e-mail. Il n'y a rien à recréer — ni fiche, ni
   identité, ni mot de passe utile. Ce fichier existe pour respecter la convention NNN + NNN_revert
   et pour dire explicitement que le retour arrière n'a pas de sens ici. */

SELECT 'revert 139 : no-op (suppression de comptes orphelins irréversible)' AS note;
