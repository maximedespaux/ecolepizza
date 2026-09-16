/* 159_entreprise_date_creation.sql
   LA DATE DE CREATION DE L'ENTREPRISE — celle de son immatriculation, pas celle de sa fiche.

   POURQUOI CETTE MIGRATION EXISTE, ET LE MALENTENDU QU'ELLE CORRIGE. `company.created_at` dit
   quand la FICHE est entree dans l'application : pour les quatre cent soixante et onze
   entreprises importees, c'est le 12/07/2026 a 15:44, toutes la meme seconde. Cela ne dit rien
   de l'entreprise elle-meme. Une convention de formation, un dossier OPCO ou un controle
   Qualiopi demandent la date d'IMMATRICULATION — celle qui figure sur l'extrait Kbis, a cote
   du SIRET et du code NAF.

   Les deux dates coexistent donc, et portent desormais des mots differents a l'ecran :
   « Ajoutee le » pour la fiche, « Date de creation » pour l'entreprise. Les confondre etait
   facile tant qu'une seule existait et s'appelait « Cree le ».

   TYPE `DATE` ET NON `TIMESTAMP` : une immatriculation est un JOUR. Lui donner une heure
   obligerait a en inventer une, et ferait dependre l'affichage du fuseau.

   NULL AUTORISE, ET C'EST LA REGLE. L'ecole ne connait pas la date de creation de la plupart
   de ses clients, et ne la connaitra jamais pour certains. Un defaut a une date arbitraire
   serait une donnee FAUSSE presentee comme vraie sur une convention. Vide veut dire vide.

   LE CODE MARCHE AVANT ET APRES : la colonne passe par `COMPANY_COLS_OPT`, sonde a chaque
   requete (cf. company.controller.js). Sans elle, le champ est simplement ignore a
   l'enregistrement — comme `vat_number` avant la 123. */

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS date_creation DATE DEFAULT NULL
    COMMENT 'Date d immatriculation de l entreprise (Kbis). NULL = inconnue. Cf. migration 159.';
