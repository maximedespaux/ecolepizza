/* 153_archives_chiffrees.sql
   LE COFFRE DOCUMENTAIRE PASSE AU CHIFFREMENT AU REPOS — et les deux colonnes qu'il faut
   pour que ça n'en casse rien.

   POURQUOI. `archive_document.file` est le PLUS GROS stock de documents de l'application :
   681 Mo de PDF réels — contrats, attestations, feuilles d'émargement signées, évaluations.
   C'était aussi le SEUL qui restait en clair. Les pièces justificatives (scans de carte
   d'identité), les documents importés, les PDF signés, les signatures et les numéros de
   sécurité sociale sont tous chiffrés en AES-256-GCM depuis leur création ; le coffre, non.
   Or la sauvegarde nocturne est un `mariadb-dump` de la base entière : chaque nuit, ces 681 Mo
   de documents nominatifs partaient en clair dans un fichier, quatorze fois de suite. Une copie
   égarée de ce fichier, c'est le dossier complet de 1069 stagiaires, lisible tel quel.

   CE QUE LE CHIFFREMENT CASSE, ET QUE CES DEUX COLONNES RÉPARENT. L'écran de stockage compte
   les octets et repère les doublons avec `LENGTH(file)` et une empreinte calculée EN BASE. Sur
   un contenu chiffré, les deux deviennent faux : l'IV est tiré au hasard à chaque chiffrement,
   donc deux exemplaires du MÊME document donnent deux empreintes différentes — la détection de
   doublons ne signalerait plus rien, en silence. On mémorise donc l'empreinte et la taille du
   contenu EN CLAIR au moment de l'écriture ; elles ne révèlent rien du document et restent
   comparables entre elles.

   LE CODE MARCHE AVANT ET APRÈS, dans les deux sens :
     · lecture — `decryptBytes` rend le tampon TEL QUEL s'il ne porte pas le marqueur « encb1 » :
       un PDF encore en clair se sert donc normalement ;
     · stockage — `COALESCE(empreinte, SHA2(file, 256))` et `COALESCE(octets, LENGTH(file))` :
       une ligne pas encore reprise est mesurée en base comme avant. SHA2 et non MD5 pour que
       la valeur calculée en base sur une ligne en clair soit ÉGALE à celle mémorisée sur la
       même ligne une fois chiffrée — sans quoi, le temps de la reprise, un doublon
       clair/chiffré passerait inaperçu.

   LA REPRISE DES 1140 LIGNES EXISTANTES N'EST PAS ICI, et ne peut pas l'être : chiffrer demande
   la clé, que SQL n'a pas. Elle se fait avec `node database/tools/chiffrer-archives.js`, qui
   refuse de démarrer sans SSN_ENC_KEY et vérifie chaque aller-retour avant d'écrire.

   ⚠ AVANT DE LANCER LA REPRISE : s'assurer que SSN_ENC_KEY est sauvegardée HORS du serveur.
   Elle l'a déjà été perdue une fois (août 2026) ; ce jour-là, quatre valeurs de test l'ont
   payé. Après cette reprise, la perdre coûterait les 681 Mo de preuve Qualiopi. */

ALTER TABLE archive_document
    ADD COLUMN IF NOT EXISTS empreinte char(64) DEFAULT NULL
        COMMENT 'SHA-256 du contenu EN CLAIR : deux chiffrés du même document diffèrent',
    ADD COLUMN IF NOT EXISTS octets bigint DEFAULT NULL
        COMMENT 'Taille du contenu EN CLAIR : LENGTH(file) mesure le chiffré';

/* Le regroupement par doublon lit ces deux colonnes ensemble, pour toute une organisation. */
ALTER TABLE archive_document
    ADD INDEX IF NOT EXISTS idx_archdoc_empreinte (organization_id, empreinte);
