/* 127_revert_pieces_stagiaire.sql
   Retour arriere de 127. LES PIECES DEPOSEES SONT DETRUITES, sans recours.

   Ce que cela efface : les copies de pieces d'identite et autres justificatifs envoyes par les
   stagiaires, la trace de qui les a verifiees, et le referentiel de ce qu'on demandait.

   PARADOXE ASSUME : cette destruction est justement ce que le RGPD attend a terme. Reverter
   n'est donc pas dangereux pour les personnes — c'est dangereux pour l'ORGANISME, qui perd la
   preuve d'avoir verifie une identite, et devra la redemander a chaque stagiaire concerne.

   L'ordre compte : `piece_fichier` pointe vers `piece_depot`, qui pointe vers `piece_type`. On
   defait dans le sens inverse de la creation. La colonne de `program_step` part en dernier :
   des etapes de parcours la referencent encore tant que les tables existent. */

ALTER TABLE program_step
    DROP COLUMN IF EXISTS piece_id;

DROP TABLE IF EXISTS piece_fichier;
DROP TABLE IF EXISTS piece_depot;
DROP TABLE IF EXISTS piece_type;
