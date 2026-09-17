/* 165_revert_titres_documents.sql
   RIEN À REMETTRE — c'est voulu, pas un oubli.

   La 165 ne touche pas au schéma : elle remplace, dans le titre de quelques documents non signés,
   un code (« LIVRET_ACCUEIL ») par l'intitulé de leur modèle (« Livret d'accueil »).

   Il n'y a rien à protéger : le code d'AVANT lit parfaitement un titre en toutes lettres — c'est
   une chaîne comme une autre, et le TYPE, qui sert d'identifiant, n'a pas bougé. Revenir sur le
   code ne demande donc aucune reprise de données ; la règle du § 2.1 (le code marche avant ET
   après) est tenue sans ce fichier.

   Remettre les codes, ce serait recréer à la main le défaut que la migration corrige. Et on ne
   saurait plus distinguer les documents renommés par la 165 de ceux qui ont reçu le même intitulé
   autrement (saisi à la main, ou créé depuis par le nouveau code) : un revert « exact » n'existe
   pas.

   Il existe pour que la paire soit complète et que personne ne cherche un revert manquant.
   L'instruction ci-dessous ne fait rien : certains outils refusent un fichier fait uniquement
   de commentaires (« Query was empty »). */

DO 0;
