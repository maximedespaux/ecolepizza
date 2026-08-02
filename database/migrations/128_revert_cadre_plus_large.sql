/* 128_revert_cadre_plus_large.sql
   Revert de 128.

   ATTENTION : ce revert RETRECIT une colonne. Les valeurs deja ecrites tiennent toutes dans
   seize caracteres tant qu'aucun palier plus long n'a ete ajoute (c'etait tout l'objet de la
   migration). Si un palier plus long existe entre-temps, MariaDB refusera le ALTER en mode
   strict, et tronquera sinon — verifier avant de jouer :

     SELECT id, cadre FROM learner WHERE CHAR_LENGTH(cadre) > 16;

   Aucune ligne : le revert est sans effet de bord. */

ALTER TABLE learner
    MODIFY COLUMN cadre VARCHAR(16) NULL DEFAULT NULL;
