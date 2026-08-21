/* 131_partner_recoit_coordonnees.sql
   QUELS PARTENAIRES REÇOIVENT LES COORDONNÉES DES STAGIAIRES — et lesquels n'ont rien à en faire.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   LE DÉFAUT QUE CETTE COLONNE CORRIGE, et il touche le consentement lui-même.

   L'annuaire compte vingt-trois partenaires. La demande de consentement les NOMME tous, parce que
   c'est ce qui la rend « éclairée » : on ne peut pas consentir utilement à « nos partenaires ».
   Mais tous n'ont aucun besoin des coordonnées d'un stagiaire. Un fabricant de fours, un fournisseur
   de farine dont l'école achète le catalogue, un partenaire qui ne fait que remiser : aucun n'a de
   raison de recevoir un téléphone personnel.

   Demander à quelqu'un d'accepter vingt-trois destinataires quand quatre suffisent n'est pas une
   approximation bénigne. C'est un consentement PLUS LARGE QUE LE BESOIN, ce que la minimisation
   (art. 5.1.c) interdit, et c'est aussi le meilleur moyen de faire refuser tout le monde : une
   liste de vingt-trois entreprises inconnues se lit comme une revente de fichier.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   DÉFAUT À 0, ET C'EST LE POINT LE PLUS IMPORTANT DE CETTE MIGRATION.

   `DEFAULT 0` signifie qu'après l'avoir jouée, PLUS AUCUN partenaire n'est destinataire tant que
   l'école ne l'a pas coché un par un. C'est délibéré, et c'est le seul sens acceptable :

     · à 1, la migration transformerait d'un coup vingt-trois annuaires en destinataires de données
       personnelles, sans que personne ne l'ait décidé — une aggravation déguisée en mise à jour ;
     · à 0, le pire qui puisse arriver est qu'une liste ne parte pas. Une liste qui ne part pas se
       rattrape en cochant une case ; des coordonnées parties chez quelqu'un qui n'aurait pas dû
       les recevoir ne se rattrapent pas.

   L'école DOIT donc rouvrir sa page Partenaires après cette migration et cocher les quelques
   partenaires réellement concernés. Rien ne se transmettra avant.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   CONSÉQUENCE SUR LES CONSENTEMENTS DÉJÀ RECUEILLIS : aucune, et c'est voulu.

   Chaque ligne du registre a figé la liste des destinataires TELLE QU'ELLE ÉTAIT au moment de la
   réponse (`consent_record.destinataires`). Restreindre la liste aujourd'hui ne rend donc aucun
   accord passé caduc : la personne a consenti à un ensemble PLUS LARGE que celui qui recevra
   réellement. Le sens de l'écart est le bon — on transmet à moins de monde qu'annoncé.

   L'écart inverse, lui, exigerait de redemander : ajouter un destinataire après coup transmettrait
   à quelqu'un que la personne ne pouvait pas connaître. C'est exactement ce que la comparaison
   entre `consent_record.destinataires` et la liste du jour permet de voir.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   LE CODE MARCHE AVANT COMME APRÈS. Sans la colonne, la lecture des destinataires retombe sur
   « tous les partenaires » (comportement actuel) et l'export ne bloque personne. Avec elle, les
   deux se restreignent. */

ALTER TABLE partner
    ADD COLUMN IF NOT EXISTS recoit_coordonnees TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Ce partenaire reçoit-il nom, e-mail, téléphone et formation des stagiaires ayant consenti ?';

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   LE CONTRAT, ET SA DATE DE FIN — parce qu'un partenariat qui s'arrête ne se remarque pas.

   CE QUI SE PASSE SANS CES COLONNES : un contrat arrive à échéance, personne ne s'en aperçoit, et
   l'école continue d'afficher les offres de l'entreprise à ses stagiaires — voire de lui envoyer
   leurs coordonnées. Une convention expirée ne se manifeste par aucun signal : elle ne provoque ni
   erreur, ni alerte, ni ligne rouge quelque part. Elle cesse simplement d'exister, en silence,
   pendant que l'outil se comporte comme si de rien n'était.

   C'est un problème commercial, mais surtout un problème de DONNÉES : transmettre des coordonnées
   de stagiaires à une entreprise avec qui l'on n'a plus d'accord, c'est transmettre sans cadre. Le
   consentement recueilli nommait un partenaire de l'école ; il ne couvre pas une entreprise
   devenue tierce.

   TROIS COLONNES, ET LA DATE DE FIN N'EN FAIT PAS PARTIE.

     · `contrat`            — y a-t-il un contrat à suivre ? Toutes les relations n'en ont pas, et
                              une simple remise de fournisseur ne doit pas réclamer une échéance.
     · `contrat_debut`      — quand il commence.
     · `contrat_duree_mois` — combien de temps il court.

   LA FIN SE CALCULE (`DATE_ADD(contrat_debut, INTERVAL contrat_duree_mois MONTH)`) au lieu d'être
   stockée. Une quatrième colonne s'écarterait des trois autres au premier avenant : on corrigerait
   la durée sans toucher la date de fin, ou l'inverse, et il faudrait ensuite deviner laquelle fait
   foi. Une seule source, aucun désaccord possible.

   CE QU'UN CONTRAT EXPIRÉ DÉCLENCHE, et c'est le point : le partenaire est ÉCARTÉ, pas supprimé.
   Ses offres cessent d'apparaître aux stagiaires, il n'est plus nommé dans la demande de
   consentement, et l'export refuse de produire sa liste. Sa fiche, son historique et ses
   commissions restent intacts — un partenariat terminé fait partie de l'histoire de l'école, et
   l'effacer rendrait incompréhensibles les factures et les apports passés.

   `contrat` À 0 NE BLOQUE RIEN. Ne pas suivre de contrat n'est pas la même chose qu'en avoir un
   qui a expiré : seul le second écarte. Sans quoi jouer cette migration couperait d'un coup toutes
   les relations pour lesquelles l'école n'a jamais saisi de date. */
ALTER TABLE partner
    ADD COLUMN IF NOT EXISTS contrat TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Ce partenariat est-il encadré par un contrat dont il faut suivre l échéance ?',
    ADD COLUMN IF NOT EXISTS contrat_debut DATE DEFAULT NULL
        COMMENT 'Date de prise d effet du contrat',
    ADD COLUMN IF NOT EXISTS contrat_duree_mois INT DEFAULT NULL
        COMMENT 'Durée en mois ; la date de fin se calcule, elle n est pas stockée';
