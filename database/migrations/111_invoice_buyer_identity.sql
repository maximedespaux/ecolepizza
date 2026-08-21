/* 111_invoice_buyer_identity.sql
   L'acheteur d'une vente : garder la personne, pas seulement son nom.

   LE DEFAUT. Une vente au comptoir n'enregistre de son acheteur qu'un `buyer_name`, une chaine
   de caracteres. Le stagiaire choisi a l'ecran est aplati en « Prenom Nom » et le lien vers sa
   fiche est PERDU au moment meme ou on l'avait. Tout ce que la fiche porte — adresse e-mail,
   adresse postale — devient alors inatteignable depuis la facture.

   CE QUE CA COUTE. BT-49, l'adresse electronique de l'acheteur, est OBLIGATOIRE en France
   (BR-FR-12). Elle etait dans la base, sur la fiche du stagiaire, et la facture ne pouvait pas
   la lire. C'est le meme patron que les defauts « la personne a la place du dossier » deja
   corriges ailleurs : une reference remplacee par une etiquette.

   `learner_id` NE REMPLACE PAS `buyer_name`, il l'accompagne. Le nom libre reste le seul
   recours pour une vente a un passant, et une facture deja emise ne doit pas changer d'acheteur
   parce qu'on a renomme une fiche : le nom garde ce qui a ete imprime, la reference ouvre ce
   qui peut etre relu.

   `buyer_email` sert au cas ou il n'y a NI stagiaire NI entreprise. Sans elle, une vente a un
   client de passage ne peut pas etre conforme, et rien dans l'interface ne permettrait de le
   corriger.

   ON NE REPREND PAS L'EXISTANT. On pourrait rapprocher les anciennes factures d'une fiche par
   leur `buyer_name`, mais deux stagiaires peuvent porter le meme nom : le rapprochement
   attribuerait une facture au mauvais client, en silence, sur des pieces comptables deja
   emises. Les anciennes factures gardent donc leur nom seul.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS learner_id uuid DEFAULT NULL
    COMMENT 'Stagiaire acheteur (vente boutique). NULL = nom libre ou entreprise.';

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS buyer_email varchar(255) DEFAULT NULL
    COMMENT 'Adresse e-mail de l acheteur (BT-49) quand il n est ni stagiaire ni entreprise.';

/* ON DELETE SET NULL, pas CASCADE : supprimer une fiche stagiaire ne doit pas faire disparaitre
   une facture. Une piece comptable se conserve independamment des personnes qu'elle nomme. */
ALTER TABLE invoice
    ADD CONSTRAINT fk_invoice_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE SET NULL;
