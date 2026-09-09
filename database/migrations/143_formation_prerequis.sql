/*
 * LES PRÉREQUIS D'UNE FORMATION — texte libre, et un jeton pour les documents.
 *
 * POURQUOI UNE COLONNE PLUTÔT QU'UN CHAMP EXISTANT. « Public visé » (audience) dit À QUI la
 * formation s'adresse ; les prérequis disent CE QU'IL FAUT DÉJÀ SAVOIR OU POSSÉDER pour y entrer
 * — savoir lire le français, être majeur, disposer d'un certificat d'hygiène. Ce n'est pas la
 * même question, et Qualiopi les contrôle séparément : les fondre dans `audience` rendrait le
 * programme de formation faux au moment précis où on le présente à l'audit.
 *
 * TEXTE LIBRE, et pas une liste : la formulation exacte engage l'organisme, elle se reprend telle
 * quelle sur le programme et le contrat. Une liste de cases à cocher obligerait à réécrire chaque
 * formulation dans le vocabulaire de l'application — c'est-à-dire à la trahir.
 *
 * NULL = non renseigné. Le jeton {Prérequis} rend alors une chaîne vide, comme les autres jetons
 * de formation : un document qui le porte s'imprime sans trou ni « undefined ».
 *
 * `ADD COLUMN IF NOT EXISTS` → rejouable sans risque. Le code fonctionne AVANT comme APRÈS :
 * la lecture passe par `colonneOuNull` (rend `NULL AS prerequisites` tant que la colonne manque),
 * et l'écriture retombe sur le repli déjà en place qui retire les colonnes récentes absentes.
 */
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS prerequisites text DEFAULT NULL;
