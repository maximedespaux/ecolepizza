/* DÉSACTIVATION VOLONTAIRE D'UN PROFIL STAGIAIRE (demandé le 2026-10-02).

   Un stagiaire peut désactiver son profil depuis « Mon profil → Compte ». On pose ici la DATE de
   sa demande. TOUTE CONNEXION l'efface (se reconnecter = garder son profil). Au bout de 15 SEMAINES
   sans connexion, un passage quotidien (lib/purgeComptesDesactives.js) SUPPRIME ses données non
   essentielles — progression Pizza Quest, mercuriale, fiches techniques (et ce qu'il a écrit
   autour) — et DÉSACTIVE sa connexion (active = 0, migration 011). Les documents, pièces, parcours,
   émargement, factures et consentements sont TOUJOURS gardés : ce sont des preuves.

   Rien n'est bloquant sans la colonne : le bouton se cache, la désactivation répond 503, et le
   passage ne trouve pas la colonne — il sort sans rien faire. La connexion n'efface la date que par
   une requête À PART, pour qu'une colonne absente n'empêche jamais la trace de connexion. */
ALTER TABLE user ADD COLUMN IF NOT EXISTS deactivated_at DATETIME NULL;
