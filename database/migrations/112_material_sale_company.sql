/* 112_material_sale_company.sql
   La vente de materiel peut etre payee par une entreprise.

   POURQUOI. Jusqu'ici une vente en caisse n'avait qu'un acheteur possible : un stagiaire, ou
   personne (vente comptoir). Or c'est parfois l'ENTREPRISE qui achete le materiel — pour ses
   salaries en formation, ou pour elle-meme. La facture savait deja s'adresser a une entreprise
   (invoice.company_id existe depuis l'origine, et le PDF Factur-X lit son SIRET et son e-mail),
   mais la caisse ne pouvait pas la designer : la vente comptable, elle, n'avait pas de colonne.

   material_sale ne portait que learner_id. On ajoute company_id, au meme niveau : une vente est
   rattachee A UNE ENTREPRISE, A UN STAGIAIRE, OU AUX DEUX. Le cas « aux deux » est voulu — du
   materiel facture a l'entreprise mais destine a un stagiaire precis se retrouve ainsi par
   l'un comme par l'autre.

   L'entreprise qui FACTURE reste portee par invoice.company_id ; company_id sur material_sale
   sert au rapprochement comptable (chiffre d'affaires par entreprise), pas a la facturation.

   ON DELETE SET NULL, comme pour learner_id : supprimer une fiche entreprise ne doit pas
   effacer l'historique des ventes qu'elle a payees. Une ecriture comptable survit aux tiers
   qu'elle nomme.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE material_sale
    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT NULL
    COMMENT 'Entreprise acheteuse (vente en caisse). NULL = stagiaire ou vente comptoir.';

ALTER TABLE material_sale
    ADD CONSTRAINT fk_sale_company FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE SET NULL;
