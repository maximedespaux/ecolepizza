/* 193_memo_fichiers.sql

   LES PIÈCES JOINTES D'UN MÉMO — deux au plus, une image (collée ou choisie) ou un PDF
   (demandé le 2026-09-30).

   POURQUOI. Un pense-bête renvoie souvent à ce qu'on a SOUS LES YEUX : une capture d'écran, la
   photo d'un bon de livraison, le PDF d'un devis reçu. Le recopier en texte, c'est le perdre à
   moitié.

   UNE TABLE À PART, et pas une colonne de `memo`. La liste des mémos se relit toutes les minutes,
   et à chaque geste d'un collègue : des octets rangés dans `memo` partiraient à chaque relecture.
   Ici la liste ne lit que le nom, le type et le poids, et le fichier ne voyage que quand on l'ouvre.

   LES OCTETS SONT CHIFFRÉS AU REPOS (AES-256-GCM, lib/crypto.js), comme les photos de la Communauté
   et les pièces des stagiaires. Un mémo est une note PRIVÉE, et ce qu'on y joint peut montrer un
   nom, une adresse, un relevé. `octets` garde le poids EN CLAIR, pour l'afficher sans rien
   déchiffrer.

   LE TYPE EST CELUI QUE LES OCTETS PROUVENT (JPEG, PNG, WebP ou PDF), jamais celui que l'envoi
   déclare : le fichier est resservi tel quel, sous le type enregistré ici.

   DEUX PAR MÉMO : c'est le serveur qui compte (lib/memoFichiers.js), `rang` garde leur ordre. Ils
   partent avec leur mémo (ON DELETE CASCADE), et seulement avec lui.

   Le code marche AVANT la migration : les mémos s'écrivent sans pièce jointe, le bouton « Joindre »
   ne paraît pas, et un mémo envoyé avec un fichier est refusé EN ENTIER (503) plutôt que créé sans
   lui. APRÈS, tout apparaît. Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS memo_fichier (
    id         uuid         NOT NULL DEFAULT uuid(),
    memo_id    uuid         NOT NULL,
    nom        varchar(160) NOT NULL,
    mime       varchar(40)  NOT NULL,
    octets     int unsigned NOT NULL,
    bytes      mediumblob   NOT NULL,
    rang       tinyint      NOT NULL DEFAULT 0,
    created_at timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    /* La seule question posée : « les pièces de CES mémos, dans leur ordre ». */
    KEY idx_memo_fichier_memo (memo_id, rang),
    CONSTRAINT fk_memo_fichier_memo FOREIGN KEY (memo_id) REFERENCES memo (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
