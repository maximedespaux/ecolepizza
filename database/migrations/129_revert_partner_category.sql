/* 129_revert_partner_category.sql
   Annule 129_partner_category.sql : les catégories de partenaires redeviennent la liste écrite
   en dur dans l'écran.

   CE QUI EST PERDU, et il faut le savoir avant de jouer ce fichier : les catégories CRÉÉES par
   l'école (au-delà des huit d'origine) disparaissent de la table, mais les partenaires qui les
   portent GARDENT leur code — `partner.category` n'est pas touché. Ces partenaires se
   retrouveront donc avec une catégorie que l'écran ne sait plus nommer : elle ne figurera pas
   dans le filtre, et le badge affichera le code brut. Aucune donnée de partenaire n'est effacée,
   mais le classement devient partiellement muet.

   ON NE REMET PAS L'ENUM sur `partner.category`. Le fichier aller a pu libérer la colonne ; la
   repasser en ENUM des huit valeurs d'origine ÉCHOUERAIT sur toute base contenant un partenaire
   rangé dans une catégorie créée depuis — c'est-à-dire précisément le cas où l'on veut reverter.
   Un varchar plus large qu'un ENUM ne gêne rien : on le laisse. */

DROP TABLE IF EXISTS partner_category;
