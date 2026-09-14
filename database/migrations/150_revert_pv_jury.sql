/*
 * Retour en arrière de la 150.
 *
 * ON NE SUPPRIME PAS `exam_session` NI `exam_result`. Elles viennent de la migration 100, que
 * ce fichier n annule pas : les détruire ici effacerait des procès-verbaux que l organisme est
 * tenu de conserver dix ans, pour revenir sur quatre colonnes. Le revert de la 100 existe
 * séparément si l on veut vraiment tout retirer.
 *
 * ⚠️ Les quatre colonnes retirées PERDENT leur contenu : l heure de commission, le
 * représentant, sa fonction et les aléas. Les PV déjà imprimés, eux, les portent.
 */

ALTER TABLE exam_session DROP COLUMN IF EXISTS aleas;
ALTER TABLE exam_session DROP COLUMN IF EXISTS representant_fonction;
ALTER TABLE exam_session DROP COLUMN IF EXISTS representant;
ALTER TABLE exam_session DROP COLUMN IF EXISTS heure;
