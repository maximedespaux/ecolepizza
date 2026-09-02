/* 141_piece_type_limits.sql

   LIMITES PAR TYPE DE PIÈCE : taille maximale et formats acceptés, propres à CHAQUE pièce.

   Jusqu'ici, deux plafonds valaient pour TOUT l'organisme, codés en dur (piece.controller) :
   3 Mo par fichier, et les formats JPEG/PNG/WebP/PDF. On les rend RÉGLABLES par pièce — une
   carte d'identité peut se limiter à la photo (pas de PDF), un justificatif comptable au PDF
   seul, et l'un tolérer plus lourd que l'autre.

   NULL = « valeur par défaut de l'organisme » (les plafonds codés restent le repli) : une pièce
   existante ne change pas de comportement tant qu'on ne lui fixe rien. `max_octets` en OCTETS
   (comme la constante côté code) ; `mimes` = tableau JSON de types MIME autorisés (ex.
   ["image/jpeg","application/pdf"]).

   `ADD COLUMN IF NOT EXISTS` → rejouable. Le code lit ces colonnes sous sonde et retombe sur les
   plafonds codés si elles manquent : il fonctionne avant comme après. */
ALTER TABLE piece_type
    ADD COLUMN IF NOT EXISTS max_octets int  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mimes      text DEFAULT NULL;
