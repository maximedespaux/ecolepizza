/* 153_revert_archives_chiffrees.sql

   ⚠ CE REVERT NE DÉCHIFFRE RIEN. Il retire les deux colonnes de mesure, pas le chiffrement des
   documents : `file` reste chiffré, et c'est voulu — `decryptBytes` sait le relire, l'écran de
   stockage retombe sur `SHA2(file, 256)` / `LENGTH(file)`, qui redeviennent alors faux (une
   empreinte par exemplaire, une taille majorée de 33 octets). Autrement dit : reverter fait
   perdre la détection de doublons, pas les documents.

   POUR REVENIR VRAIMENT EN ARRIÈRE — remettre les PDF en clair — il faut relancer la reprise
   dans l'autre sens : `node database/tools/chiffrer-archives.js --dechiffrer`. À ne faire que
   si l'on sait pourquoi : le clair, c'est ce que la migration 153 corrigeait. */

ALTER TABLE archive_document
    DROP INDEX IF EXISTS idx_archdoc_empreinte;

ALTER TABLE archive_document
    DROP COLUMN IF EXISTS empreinte,
    DROP COLUMN IF EXISTS octets;
