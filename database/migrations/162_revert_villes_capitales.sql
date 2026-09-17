/* 162_revert_villes_capitales.sql
   RIEN À REMETTRE — c'est voulu, pas un oubli.

   La 162 ne touche pas au schéma : elle réécrit la CASSE de quelques villes. La casse d'origine
   n'est conservée nulle part, et « Tarbes » ne se déduit pas de « TARBES » (ni « Saint-Lary » de
   « SAINT-LARY »). Un revert qui prétendrait la restaurer inventerait une valeur.

   Et il n'y a rien à protéger : le code d'AVANT accepte parfaitement une ville en capitales —
   c'est une chaîne comme une autre. Revenir sur le code ne demande donc aucune reprise de
   données ; la règle du § 2.1 (le code marche avant ET après) est tenue sans ce fichier.

   Il existe pour que la paire soit complète et que personne ne cherche un revert manquant.
   L'instruction ci-dessous ne fait rien : certains outils refusent un fichier fait uniquement
   de commentaires (« Query was empty »). */

DO 0;
