/* 132_partner_nom_unique.sql
   DEUX PARTENAIRES NE PEUVENT PLUS PORTER LE MÊME NOM DANS UN ORGANISME.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   LE DÉFAUT CONSTATÉ, PAS SUPPOSÉ : l'annuaire contenait DEUX fiches « Berkel ». Même organisme,
   même catégorie, même seconde de création. L'une portait le produit « Trancheuses à jambon »,
   l'autre était entièrement vide — ni contact, ni ville, ni commission.

   L'origine exacte n'a pas pu être retrouvée : le dépôt ne contient qu'un seul `INSERT INTO
   partner` (`dev_data.sql`), il ne nomme Berkel qu'une fois, et il est protégé par un
   `WHERE NOT EXISTS` sur le nom — le rejouer ne peut donc pas produire ce doublon. Ce qui EST
   établi, c'est que rien ne l'empêchait : aucune contrainte en base, aucun contrôle dans
   `createPartner`. Ce fichier ferme la porte plutôt que de chercher qui l'a franchie.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI UN HOMONYME COÛTE PLUS CHER QU'IL N'EN A L'AIR.

   Un doublon dans un annuaire, c'est ordinairement une gêne d'affichage. Ici, non :

     · LA DEMANDE DE CONSENTEMENT NOMME LES PARTENAIRES (`destinatairesPartenaires`), et le texte
       obtenu est FIGÉ dans le registre comme preuve de ce que la personne a lu. Deux fiches
       homonymes cochées produisent « …, Berkel, Berkel, … » : une preuve qui a l'air fausse, et
       qu'on ne peut plus corriger après coup puisqu'elle doit rester telle qu'elle a été montrée.

     · LE SEMIS DES PRODUITS JOINT SUR LE NOM (`partner_products_seed.sql` :
       `JOIN partner p ON … AND p.name = 'Berkel'`). Avec deux fiches, la jointure en trouve deux
       et le catalogue se dédouble — silencieusement, puisque la requête réussit.

     · ET L'UTILISATEUR DOIT COCHER « reçoit les coordonnées » SUR LA BONNE des deux cartes
       identiques. Se tromper ne produit aucune erreur : simplement, rien ne part.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   ⚠ CETTE MIGRATION ÉCHOUE S'IL RESTE DES HOMONYMES, et c'est voulu : elle refuse de s'appliquer
   plutôt que de laisser croire qu'elle protège. Pour les trouver avant de la jouer :

       SELECT organization_id, name, COUNT(*) AS n
         FROM partner GROUP BY organization_id, name HAVING n > 1;

   Fusionner ou supprimer les doublons d'abord — en gardant celle qui porte les produits et les
   commissions, l'autre étant en général la coquille vide.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   LE NOM RESTE MODIFIABLE. La contrainte porte sur le couple (organisme, nom) : renommer un
   partenaire reste possible tant que le nouveau nom est libre. Deux organismes différents peuvent
   évidemment avoir chacun leur « Metro ».

   La casse et les accents suivent la collation de la table (`utf8mb4_general_ci`, insensible à la
   casse) : « berkel » et « Berkel » sont donc déjà considérés comme le même nom, ce qui est le
   comportement souhaité — un annuaire ne doit pas distinguer deux fiches par une majuscule. */

ALTER TABLE partner
    ADD UNIQUE KEY uq_partner_nom (organization_id, name);
