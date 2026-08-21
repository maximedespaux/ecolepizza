/* 117_billing_profile_is_org.sql
   Reconnaitre l'entite emettrice issue de l'organisme.

   POURQUOI. L'organisme est l'emetteur naturel : c'est sous son identite qu'on facture par
   defaut, et les autres entites (« Boutique »…) ne sont que des ALTERNATIVES qu'on ajoute. On
   semait bien une entite depuis l'organisme, mais seulement quand il n'y en avait AUCUNE : un
   organisme qui avait deja cree une entite a la main se retrouvait sans entite « organisme », et
   son defaut tombait sur l'alternative — l'inverse de ce qu'on veut.

   `is_organization` marque l'entite qui EST l'organisme. Le code peut alors la semer meme quand
   d'autres entites existent (il suffit qu'aucune ne porte deja ce drapeau), la designer par
   defaut, et empecher sa suppression — supprimer « l'organisme » n'aurait pas de sens, et il
   serait de toute facon re-seme.

   Une seule par organisme, en pratique : le code ne la cree que si aucune n'existe. On ne pose
   pas de contrainte d'unicite dessus pour rester tolerant a un ancien etat.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS is_organization tinyint(1) NOT NULL DEFAULT 0
    COMMENT 'Entite issue de l organisme (emetteur par defaut, non supprimable).';
