/* 129_partner_category.sql
   LES CATÉGORIES DE PARTENAIRES, gérées par l'organisme.

   Elles étaient écrites EN DUR dans l'écran (`pages/Partenaires.jsx`) :
       FARINE · MATERIEL · FOUR · CHARCUTERIE · FROMAGE · CONSERVE · DISTRIBUTION · AUTRE
   Huit valeurs choisies une fois, que l'école ne pouvait ni renommer, ni compléter, ni ranger.
   Un partenaire « Boissons », « Emballage » ou « Assurance » n'avait d'autre place que « AUTRE »,
   et le filtre de la page devenait inutile à mesure que ce fourre-tout grossissait.

   LE CODE RESTE LA CLÉ, PAS LE LIBELLÉ. `partner.category` continue de stocker « FARINE » ; la
   table ne fait qu'y attacher un intitulé affichable, une couleur et un ordre. Renommer
   « Matériel » en « Équipement » ne touche donc AUCUNE ligne de partenaire — c'est ce qui rend
   l'opération sans risque, et c'est la raison de ne pas être passé par une clé étrangère.

   POURQUOI LE `MODIFY` SUR `partner.category`. La table `partner` est antérieure au dossier de
   migrations : son schéma n'est pas lisible ici, et rien ne dit si la colonne est un ENUM des huit
   valeurs ou un varchar. Si c'est un ENUM, la première catégorie créée par l'école serait REFUSÉE
   à l'insertion — la fonctionnalité ne marcherait que pour les huit d'origine, ce qui est
   exactement ce qu'on vient corriger. Le MODIFY tranche la question dans les deux cas : sur un
   varchar il ne change rien, sur un ENUM il libère la colonne en conservant les valeurs
   existantes, qui deviennent des chaînes identiques. Rejouable sans risque.

   Le code marche AVANT comme APRÈS : sans la table, le serveur renvoie la liste des huit valeurs
   d'origine et l'écran se comporte comme aujourd'hui. */

ALTER TABLE partner
    MODIFY COLUMN category varchar(60) NOT NULL DEFAULT 'AUTRE'
    COMMENT 'Code de catégorie — cf. partner_category. Libre depuis la migration 129.';

CREATE TABLE IF NOT EXISTS partner_category (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    /* LE CODE est ce qui est stocké sur le partenaire. Majuscules sans accent : il traverse des
       URL de filtre (`?category=`) et se compare en SQL. */
    code            varchar(60)  NOT NULL,
    /* L'INTITULÉ est ce qui s'affiche, et lui seul est libre — accents, espaces, casse. Avant, la
       page montrait le code brut (« CHARCUTERIE ») faute d'avoir où ranger un libellé. */
    label           varchar(120) NOT NULL,
    color           varchar(20)  DEFAULT NULL,   /* #rrggbb ; sinon teinte neutre */
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_partcat_code (organization_id, code),
    KEY idx_partcat_org (organization_id, sort_order),
    CONSTRAINT fk_partcat_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* SEMENCE : les huit valeurs d'origine, pour CHAQUE organisation, avec un intitulé lisible.
   Le `NOT EXISTS` rend le fichier rejouable et respecte les renommages déjà faits — une école qui
   a rebaptisé « FOUR » en « Fours et cuisson » ne se le verra pas réécrire. */
INSERT INTO partner_category (id, organization_id, code, label, sort_order)
SELECT uuid(), o.id, x.code, x.label, x.n
  FROM organization o
  JOIN (
            SELECT 'FARINE'       AS code, 'Farine'        AS label, 1 AS n
  UNION ALL SELECT 'MATERIEL',           'Matériel',            2
  UNION ALL SELECT 'FOUR',               'Four',                3
  UNION ALL SELECT 'CHARCUTERIE',        'Charcuterie',         4
  UNION ALL SELECT 'FROMAGE',            'Fromage',             5
  UNION ALL SELECT 'CONSERVE',           'Conserve',            6
  UNION ALL SELECT 'DISTRIBUTION',       'Distribution',        7
  UNION ALL SELECT 'AUTRE',              'Autre',              99
  ) x
 WHERE NOT EXISTS (
     SELECT 1 FROM partner_category c
      WHERE c.organization_id = o.id AND c.code = x.code
 );

/* RATTRAPAGE : un partenaire portant un code absent de la liste (import ancien, valeur saisie à
   la main) verrait sa catégorie disparaître de l'écran. On crée l'entrée manquante plutôt que de
   réécrire la donnée du partenaire — on ne perd rien, et l'école décidera de la renommer ou de
   la fusionner elle-même. */
INSERT INTO partner_category (id, organization_id, code, label, sort_order)
SELECT uuid(), p.organization_id, p.category, p.category, 50
  FROM partner p
 WHERE p.category IS NOT NULL AND p.category <> ''
   AND NOT EXISTS (
       SELECT 1 FROM partner_category c
        WHERE c.organization_id = p.organization_id AND c.code = p.category
   )
 GROUP BY p.organization_id, p.category;
