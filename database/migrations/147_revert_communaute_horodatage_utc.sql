/*
 * REVERT de la 147 — les horodatages de la communauté redeviennent des DATETIME.
 *
 * MÊME PRÉCAUTION, EN SENS INVERSE. Un TIMESTAMP relu sous une session UTC rend la valeur UTC
 * qu'il portait : la session est donc forcée à UTC ici aussi, pour que le DATETIME reconstitué
 * contienne exactement ce qu'il contenait avant la 147. Sans cette ligne, jouer le revert sous
 * une session « Europe/Paris » figerait de l'heure de Paris dans une colonne qui ne se convertit
 * plus — on reviendrait à un état DIFFÉRENT de l'état de départ, décalé de deux heures.
 */

SET time_zone = '+00:00';

ALTER TABLE community_post
    MODIFY created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE community_answer
    MODIFY created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE community_image
    MODIFY created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
