/* 130_revert_registre_consentements.sql
   Annule 130_registre_consentements.sql.

   ⚠ CE QUI EST DÉTRUIT EST UNE PREUVE, ET ELLE NE SE RECONSTITUE PAS.

   `consent_record` porte les réponses des stagiaires — accord ou refus, avec leur date, leur
   formulation et les destinataires qui leur ont été montrés. L'effacer, c'est perdre la
   démonstration que chaque transmission passée était licite ; il faudrait redemander son accord à
   chaque personne, et les envois déjà faits resteraient sans justification.

   `partner_disclosure` disparaît de même, et avec lui la capacité de répondre à « à qui
   avez-vous donné mes coordonnées ? » (art. 15).

   Ne jouer ce fichier que si la fonctionnalité est abandonnée ET qu'aucune transmission n'a eu
   lieu. Sinon, exporter les deux tables ailleurs d'abord — leur contenu vaut plus que le schéma. */

DROP TABLE IF EXISTS partner_disclosure;
DROP TABLE IF EXISTS consent_record;
