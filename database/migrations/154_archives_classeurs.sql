/* 154_archives_classeurs.sql
   DES CLASSEURS LIBRES DANS LE COFFRE — pour ce qui ne se range pas par semaine.

   POURQUOI. Le coffre classe en année → semaine → formation → stagiaire, parce que c'est
   l'arborescence d'un contrôle Qualiopi : on y cherche le dossier d'une personne sur une
   session. Mais un organisme détient aussi des pièces qui n'appartiennent à AUCUNE session —
   attestation d'assurance, certificat Qualiopi, agrément, statuts, contrats de sous-traitance.
   Elles finissaient soit hors de l'application, soit rangées sous une semaine qui ne voulait
   rien dire.

   POURQUOI UNE COLONNE ET PAS UNE TABLE DE DOSSIERS. L'arbre du coffre est DÉJÀ entièrement
   dérivé des documents : aucune table ne décrit une année, une semaine ou une formation, elles
   existent parce que des documents s'y trouvent. Un classeur suit la même règle — il existe
   tant qu'il contient quelque chose, et disparaît avec son dernier document. On évite ainsi
   l'état mort qu'aucune règle ne nettoie : le dossier vide que plus personne n'ose supprimer
   parce qu'on ne sait plus s'il servait.

   LE REVERS, ASSUMÉ : on ne peut pas créer un classeur VIDE à l'avance. Le geste est « je
   nomme un classeur et j'y dépose », pas « je crée un classeur puis j'y déposerai ».

   NULL = CLASSEMENT PAR SESSION, c'est-à-dire tout ce qui existe aujourd'hui. Une ligne qui
   porte un `dossier` ignore année et semaine : elle vit dans son classeur. Le code marche donc
   avant comme après — sans la colonne, il n'y a pas de classeur, et rien d'autre ne change.

   CHIFFREMENT : rien à prévoir ici. Tout ce qui entre dans `archive_document` passe par
   `aRanger()` depuis la 153 — un document déposé dans un classeur est chiffré au repos comme
   les autres, sans une ligne de plus. */

ALTER TABLE archive_document
    ADD COLUMN IF NOT EXISTS dossier varchar(160) DEFAULT NULL
        COMMENT 'Classeur libre. NULL = rangement par annee/semaine (le cas general).';

/* L'écran liste les classeurs d'un organisme et compte ce qu'ils contiennent : c'est toujours
   « cette organisation, ce classeur », jamais un classeur seul. */
ALTER TABLE archive_document
    ADD INDEX IF NOT EXISTS idx_archdoc_dossier (organization_id, dossier);
