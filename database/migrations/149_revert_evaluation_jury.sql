/*
 * Retour en arrière de la 149.
 *
 * ORDRE INVERSE DE LA CRÉATION : `evaluation_verdict` porte une clé étrangère vers
 * `evaluation_grille`, et `evaluation_exercice.competence_id` vers `evaluation_competence`.
 *
 * ⚠️ CE REVERT PERD LES VERDICTS DU JURY et le découpage en compétences. Les NOTES, elles,
 * survivent : elles vivent dans `evaluation_note` (migration 148), que ce fichier ne touche
 * pas. Une grille de jury revenue ici redevient une liste plate de critères binaires.
 */

DROP TABLE IF EXISTS evaluation_verdict;

/* L index d abord : il porte DEUX colonnes, dont `sort_order` qui reste. Laisser MariaDB le
   réduire tout seul le garderait sur la seule `sort_order`, en doublon de `idx_evalex_grille`. */
ALTER TABLE evaluation_exercice DROP INDEX IF EXISTS idx_evalex_comp;
ALTER TABLE evaluation_exercice DROP COLUMN IF EXISTS competence_id;
ALTER TABLE evaluation_exercice DROP COLUMN IF EXISTS obligatoire;

DROP TABLE IF EXISTS evaluation_competence;

ALTER TABLE evaluation_grille DROP INDEX IF EXISTS idx_evalgrille_role;
ALTER TABLE evaluation_grille DROP COLUMN IF EXISTS role;
ALTER TABLE evaluation_grille DROP COLUMN IF EXISTS template_slug;
