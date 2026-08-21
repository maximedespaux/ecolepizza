/* 135_partner_champs_transmis.sql
   QUELLES INFORMATIONS DU STAGIAIRE PARTENT CHEZ LES PARTENAIRES — choisi par l'école, et gelé
   sur chaque consentement.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   DEUX COLONNES, ET LA SECONDE EST LA PLUS IMPORTANTE.

   `organization.partner_fields` — ce que l'école a décidé de transmettre aujourd'hui.
   `consent_record.champs`       — ce qui a été ANNONCÉ à la personne le jour où elle a répondu.

   La première seule ne suffirait pas, et c'est tout l'enjeu. Un consentement porte sur ce qui a
   été DIT : « j'accepte que vous communiquiez mon nom, mon e-mail et ma formation ». Si l'école
   ajoute le téléphone six mois plus tard, les accords déjà donnés ne le couvrent pas — la
   personne ne pouvait pas consentir à ce qu'elle ignorait. Sans trace de ce qui lui a été
   annoncé, l'organisme se retrouverait à transmettre un champ de plus en se croyant couvert par
   un « oui » qui portait sur autre chose.

   D'où la règle que le code applique : ON N'ENVOIE QUE L'INTERSECTION entre ce que l'école a
   choisi AUJOURD'HUI et ce qui avait été annoncé à CETTE personne-là. Restreindre la liste
   s'applique donc immédiatement à tout le monde ; l'élargir ne s'applique qu'aux consentements
   recueillis après le changement. Le sens de l'asymétrie est le bon : on transmet toujours moins
   que ce qui a été accepté, jamais plus.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   LE DÉFAUT À TRANSMETTRE, ET IL EST DÉLIBÉRÉ : les six champs d'origine, ceux qui étaient
   écrits en dur dans `lib/consentements.js` et annoncés jusqu'ici. Une base qui joue cette
   migration ne doit rien voir changer — ni dans le texte du consentement, ni dans l'export.

   Et `consent_record.champs` reste NULL pour les réponses ANTÉRIEURES : on ne peut pas
   reconstituer ce qui leur a été montré autrement qu'en le supposant. Le code traite ce `NULL`
   comme « les six champs d'origine », qui est la seule chose qu'on sache avec certitude — c'était
   la seule liste possible avant cette migration.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI UNE CHAÎNE ET NON UNE TABLE. Ce sont cinq à huit clés courtes, lues à chaque affichage
   et écrites une fois par an. Une table de liaison demanderait une jointure à chaque lecture pour
   représenter ce qui tient dans quarante caractères — et surtout, `consent_record` doit garder
   une COPIE FIGÉE : une clé étrangère suivrait les modifications de l'école et détruirait
   précisément la preuve qu'on cherche à constituer. */

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS partner_fields varchar(255)
        NOT NULL DEFAULT 'nom,prenom,email,telephone,formation,dates_session'
        COMMENT 'Informations du stagiaire transmises aux partenaires, séparées par des virgules';

ALTER TABLE consent_record
    ADD COLUMN IF NOT EXISTS champs varchar(255) DEFAULT NULL
        COMMENT 'Champs ANNONCÉS à la personne au moment de sa réponse ; NULL = les six d origine';
