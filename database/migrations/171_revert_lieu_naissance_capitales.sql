/* 171_revert_lieu_naissance_capitales.sql
   RIEN À REMETTRE — c'est voulu, pas un oubli, comme pour la 162.

   La 171 ne touche pas au schéma : elle réécrit la CASSE des lieux de naissance. La casse d'origine
   n'est conservée nulle part, et « Tarbes » ne se déduit pas de « TARBES » (ni « Saint-Gaudens » de
   « SAINT-GAUDENS »). Un revert qui prétendrait la restaurer inventerait une valeur.

   Et il n'y a rien à protéger : le code d'AVANT accepte parfaitement un lieu en capitales — c'est
   une chaîne comme une autre. Revenir sur le code ne demande donc aucune reprise de données.

   L'instruction ci-dessous ne fait rien : certains outils refusent un fichier fait uniquement de
   commentaires (« Query was empty »). */

DO 0;
