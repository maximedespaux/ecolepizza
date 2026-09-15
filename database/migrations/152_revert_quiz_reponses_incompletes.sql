/*
 * Retour en arrière de la 152 : IL N Y EN A PAS.
 *
 * La 152 supprime des réponses INCOMPLÈTES — des lignes dont les réponses manquantes n ont
 * jamais été écrites. Il n y a rien à restaurer : ce fichier existe pour le dire, et pour que
 * personne ne cherche un revert qui n aurait pas de sens.
 *
 * Si l on veut malgré tout revenir en arrière, c est une restauration de sauvegarde
 * (/var/backups/impastio, quotidiennes, quatorze jours), pas une migration.
 */

/* Rien à faire. */
SELECT 'La 152 supprime des réponses incomplètes : aucun retour en arrière possible.' AS revert;
