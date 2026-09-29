/* 191_fiche_photo.sql
   LA PHOTO D'UNE FICHE TECHNIQUE (demandée le 2026-09-29, avec le nouvel éditeur : la maquette
   réservait sa place en tête de fiche). La 190 manque exprès : jouée puis abandonnée (le
   destinataire des documents par jalon, retiré par la PR #246).

   POURQUOI EN BASE, ET PAS SUR LE DISQUE. Le modèle de `community_image` (114) et de `mail_image`
   (180) : un déploiement, un changement de machine, une sauvegarde — tout suit, sans dossier à
   recopier. Les octets sont CHIFFRÉS au repos, comme ceux des publications : une photo de fiche
   montre souvent quelqu'un devant sa pizza, et la sauvegarde nocturne sort de l'application.

   POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE DE `recipe`. La liste des fiches, la Communauté et
   chaque import lisent `recipe` à longueur de journée : la photo n'a rien à y faire. On ne la lit
   ici que pour la servir.

   PAS « GRASSE », demandé par l'école. Le navigateur la réduit (lib/image.js, profil `fiche` :
   1 000 px de côté, 160 Ko visés), le serveur REFUSE au-delà de 250 Ko (MAX_PHOTO_FICHE,
   recipe.controller.js), et une fiche n'a qu'UNE photo : `recipe_id` est la clé primaire, la
   nouvelle remplace l'ancienne. D'où MEDIUMBLOB et non LONGBLOB : la colonne dit elle-même
   qu'elle n'attend pas de gros fichiers.

   `empreinte` : les douze premiers caractères du SHA-256 de l'image en clair. Elle entre dans
   l'adresse de l'image (`?v=`) : une photo remplacée change d'adresse, et le cache du navigateur
   ne ressert jamais l'ancienne. `octets` : la taille en clair, pour savoir ce que les photos
   pèsent sans les déchiffrer.

   ON DELETE CASCADE : la photo n'existe que par sa fiche. COLLATE utf8mb4_general_ci : celle de
   `recipe` (cf. 107, recipe_read) — MariaDB refuse une clé étrangère entre collations différentes.

   Le code marche AVANT la migration : aucune fiche n'a de photo, l'emplacement de l'éditeur dit
   « pas encore disponible », et l'envoi répond 503. Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS recipe_photo (
    recipe_id   CHAR(36)     NOT NULL,
    mime        VARCHAR(40)  NOT NULL,
    bytes       MEDIUMBLOB   NOT NULL,
    octets      INT UNSIGNED NOT NULL,
    empreinte   CHAR(12)     NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id),
    CONSTRAINT fk_recipe_photo_recipe FOREIGN KEY (recipe_id) REFERENCES recipe (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
