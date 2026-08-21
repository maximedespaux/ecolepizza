/* 133_images_distantes.sql
   UNE IMAGE POUR LES PARTENAIRES ET POUR LES ARTICLES DE LA BOUTIQUE — par LIEN, pas par fichier.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI UN LIEN PLUTÔT QU'UN FICHIER TÉLÉVERSÉ.

   Les images existent déjà : sur le site du fournisseur, dans son catalogue en ligne. Les recopier
   dans la base créerait un second exemplaire à stocker, à sauvegarder et à mettre à jour à la main
   le jour où le fournisseur change son visuel. Un lien suit le catalogue d'origine sans rien
   dupliquer, et se corrige en collant une autre adresse.

   Le prix à payer est réel et assumé : un lien casse quand le fournisseur réorganise son site.
   L'écran le gère en masquant l'image plutôt qu'en affichant une icône brisée — une fiche sans
   photo reste lisible, une fiche avec une image cassée fait douter du reste.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   CE QUE CETTE MIGRATION N'AJOUTE PAS : `partner_product.image_url` existe DÉJÀ, depuis la 095.
   La colonne était là, acceptée en écriture, renvoyée à la boutique du stagiaire — mais aucun
   champ ne la remplissait et rien ne l'affichait. Elle attendait son écran depuis huit migrations.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   ⚠ CONSÉQUENCE À CONNAÎTRE : UNE IMAGE DISTANTE EST UNE REQUÊTE VERS UN TIERS.

   Ce n'est pas le serveur qui va chercher l'image, c'est le NAVIGATEUR DU STAGIAIRE. Le site du
   fournisseur voit donc passer son adresse IP, son navigateur, et l'heure de sa visite. Ce n'est
   pas un traceur — le fournisseur ne dépose rien sur l'appareil et ne suit personne d'un site à
   l'autre — mais c'est bien une donnée qui sort, et la page « Confidentialité » doit le dire.

   Elle est mise à jour dans le même commit, et les images sont posées en `referrerpolicy
   = "no-referrer"` : sans cela, le fournisseur recevrait en prime l'ADRESSE DE LA PAGE consultée,
   c'est-à-dire ce que la personne était en train de regarder.

   Si l'on veut un jour que rien ne sorte du tout, il faudra que le serveur télécharge l'image une
   fois et la serve lui-même. Ce n'est pas ce que fait cette migration.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   500 CARACTÈRES, comme `partner_product.image_url` et `recipe.image_url` : les URL de CDN avec
   leurs paramètres de redimensionnement sont longues. Le serveur REFUSE au-delà plutôt que de
   tronquer — une adresse coupée est une image qui ne s'affiche jamais, sans qu'on sache pourquoi. */

ALTER TABLE partner
    ADD COLUMN IF NOT EXISTS logo_url varchar(500) DEFAULT NULL
        COMMENT 'Adresse du logo du partenaire, hébergé sur son propre site';

ALTER TABLE inventory_item
    ADD COLUMN IF NOT EXISTS image_url varchar(500) DEFAULT NULL
        COMMENT 'Adresse de la photo de l article, hébergée ailleurs';
