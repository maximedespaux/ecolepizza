/* 174_referent_entreprise.sql
   LE REFERENT D'UNE ENTREPRISE : UN STAGIAIRE, OU UNE PERSONNE EN NOM ET PRENOM (demande le 2026-09-22).

   POURQUOI. Le referent tenait dans un seul champ, « Nom du referent », en capitales. Rien n'y
   disait ou finissait le prenom : « JEAN DUPONT », « DUPONT », « DUPONT JEAN » cohabitent, et la
   creation du compte du representant coupe au premier mot, qu'elle prend pour le prenom. Et quand
   le referent est un stagiaire de l'ecole (le patron d'une petite pizzeria qui se forme chez nous),
   son nom etait retape a la main, sans lien avec sa fiche.

   DEUX COLONNES :
   · representative_first_name, le PRENOM. representative_name porte alors le NOM seul, en
     capitales comme partout. Les fiches d'avant gardent leur nom complet dans representative_name
     et un prenom vide : l'application rassemble les deux cas pour l'affichage et les documents.
   · representative_learner_id, le STAGIAIRE choisi comme referent. Civilite, prenom et nom sont
     alors ceux de sa fiche, recopies a l'enregistrement, et de nouveau quand sa fiche change.
     ON DELETE SET NULL : supprimer le stagiaire laisse le nom recopie, l'entreprise garde un
     referent lisible.

   LE CODE MARCHE AVANT ET APRES. Sans la migration, le prenom saisi rejoint representative_name
   (la forme d'avant, « JEAN DUPONT ») et rien ne se perd, et le lien vers le stagiaire n'est pas
   garde : l'ecran le dit.

   Rejouable (IF NOT EXISTS). AUCUN POINT-VIRGULE dans les commentaires ni les chaines : le client
   SQL de l'organisme decoupe sur ce caractere (cf. la 146). */

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS representative_first_name varchar(120) DEFAULT NULL
        COMMENT 'Prenom du referent. representative_name porte alors le nom seul. Cf. migration 174.'
        AFTER representative_civ,
    ADD COLUMN IF NOT EXISTS representative_learner_id uuid DEFAULT NULL
        COMMENT 'Le referent est ce stagiaire. Ses civilite, prenom et nom suivent sa fiche. Cf. migration 174.'
        AFTER representative_role;

ALTER TABLE company
    ADD CONSTRAINT fk_company_referent_learner FOREIGN KEY IF NOT EXISTS (representative_learner_id)
        REFERENCES learner (id) ON DELETE SET NULL;
