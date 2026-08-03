/* 130_revert_consentement_partenaires.sql
   Annule 130_consentement_partenaires.sql.

   ⚠ CE QUI EST DÉTRUIT EST UNE PREUVE, ET ELLE NE SE RECONSTITUE PAS. Les colonnes de consentement
   portent les réponses des stagiaires — accord ou refus, avec leur date et leur formulation. Les
   effacer, c'est perdre la démonstration que la transmission aux partenaires était licite ; il
   faudrait redemander son accord à chaque personne. Le journal des envois disparaît de même, et
   avec lui la capacité de répondre à « à qui avez-vous donné mes coordonnées ? ».

   Ne jouer ce fichier que si la fonctionnalité est abandonnée ET qu'aucune transmission n'a eu
   lieu sur la base de ces consentements. Sinon, exporter d'abord les trois colonnes et la table
   `partner_disclosure` ailleurs. */

DROP TABLE IF EXISTS partner_disclosure;

ALTER TABLE learner
    DROP COLUMN IF EXISTS partner_consent,
    DROP COLUMN IF EXISTS partner_consent_at,
    DROP COLUMN IF EXISTS partner_consent_text;
