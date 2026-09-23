/* 180_mail_images.sql
   LES IMAGES DES E-MAILS (demandé le 2026-09-23, après la 178).

   POURQUOI EN BASE, ET PAS SUR LE DISQUE. C'est le modèle de `community_image` (114) et de
   `learner_avatar` (094) : le fichier part en base, jamais sur le disque du serveur. Un
   déploiement, une migration de machine, une sauvegarde nocturne — tout suit, sans dossier à
   recopier ni chemin à reconfigurer.

   POURQUOI PAS D'IMAGE DISTANTE. Les gabarits d'e-mail le disaient déjà pour le logo : une image
   chargée depuis un serveur est bloquée par défaut par la plupart des clients (« afficher les
   images ? ») et sert de mouchard. Celles-ci voyagent donc AVEC le message, en pièce jointe
   « inline » (cid:), comme le logo — elles s'affichent sans rien aller chercher.

   CE QUI EST GARDÉ : le nom d'origine (pour la reconnaître dans la bibliothèque), le type MIME
   (pour la servir et la joindre), les octets. Rien d'autre : une image de mailing n'est pas un
   document, elle n'a ni cycle de vie ni signature.

   Le code marche AVANT la migration : le bouton « Image » dit « pas encore disponible », les
   marqueurs d'image déjà écrits s'effacent au rendu, et le reste du message part normalement.
   Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS mail_image (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    nom             varchar(160) NOT NULL,
    mime            varchar(40)  NOT NULL,
    octets          longblob     NOT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    created_by      uuid         DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_mail_image_org (organization_id, created_at),
    CONSTRAINT fk_mail_image_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
