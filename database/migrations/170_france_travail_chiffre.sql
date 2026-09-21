/* 170_france_travail_chiffre.sql
   L'IDENTIFIANT FRANCE TRAVAIL CHIFFRÉ AU REPOS : la colonne s'élargit pour le recevoir.

   Demandé le 2026-09-21, en urgence : `learner.france_travail_id` (l'identifiant France Travail /
   Pôle emploi d'un demandeur d'emploi) était stocké EN CLAIR — dans la base et donc dans chaque
   sauvegarde nocturne. C'est un identifiant attribué par un organisme public, de même nature que
   le n° de sécurité sociale, déjà chiffré en AES-256-GCM. Il l'est désormais aussi, avec la même
   clé et le même code (lib/crypto.js). CHIFFRÉ et non HACHÉ : il doit se relire, sur la fiche et
   imprimé sur les documents.

   POURQUOI ÉLARGIR. Un chiffré s'écrit « enc: » suivi de l'IV, du tag et du texte en hexadécimal,
   soit 62 caractères plus deux fois la longueur du clair, environ 80 pour un identifiant de 8.
   La colonne en faisait 60 : l'écriture échouerait, ou serait TRONQUÉE sans erreur hors mode
   strict, et un chiffré tronqué ne se rouvre jamais. 255, comme le n° de sécurité sociale. Tant
   que cette migration n'est pas jouée, le code écrit encore en clair, comme avant.

   CE QUE LA MIGRATION NE FAIT PAS : chiffrer les identifiants DÉJÀ saisis. Chiffrer demande la
   clé, que SQL n'a pas. C'est l'outil qui s'en charge, dans cet ordre
     1. jouer cette migration
     2. déployer le code qui chiffre et déchiffre
     3. sudo -u impastio node database/tools/chiffrer-france-travail.js --essai
        puis la même commande sans --essai, puis avec --verifier
   L'ordre compte : chiffrer AVANT de déployer ferait afficher « enc:… » par l'ancien code.

   Rejouable sans risque : redéfinir une colonne à l'identique ne change rien.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). */

ALTER TABLE learner
    MODIFY COLUMN france_travail_id VARCHAR(255) DEFAULT NULL;
