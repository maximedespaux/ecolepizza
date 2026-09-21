/* 169_stagiaire_a_recontacter.sql
   « À RECONTACTER » : UN RAPPEL SUR LA FICHE DU STAGIAIRE.

   Demandé le 2026-09-21 : une case à cocher sur la fiche d'un stagiaire, à la création comme en
   modification, « à recontacter », en guise de rappel. Reprise sur le tableau de bord, en tête de
   la page des stagiaires en liste de priorité, et comptée par une pastille à côté de « Stagiaires »
   dans le menu.

   DEUX COLONNES
     a_recontacter          la case elle-même (0 ou 1), écrite par le formulaire comme les cases
                            du projet.
     a_recontacter_depuis   posée par le SERVEUR quand la case se coche, gardée tant qu'elle le
                            reste, effacée quand on la décoche. C'est l'ordre de la liste de
                            priorité (la personne qui attend depuis le plus longtemps en tête) et
                            le « depuis 3 jours » affiché à côté de chaque nom. Le formulaire ne
                            l'écrit jamais : un rappel ne se déclare pas plus ancien qu'il n'est.

   SANS ELLES, rien ne casse : la fiche s'enregistre et DIT que la case n'a pas été prise (réponse
   `ignores`), la liste de rappel reste vide, la pastille n'apparaît pas.
   Rejouable sans risque : colonnes ajoutées si absentes.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS a_recontacter TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS a_recontacter_depuis DATETIME DEFAULT NULL;
