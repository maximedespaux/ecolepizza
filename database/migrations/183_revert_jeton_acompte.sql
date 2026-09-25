/* 183_revert_jeton_acompte.sql
   NE FAIT RIEN, et c'est voulu.

   La 183 fait pointer des puces {custom:Acomtpe} — une clé qui ne désigne plus aucun jeton, et
   s'imprime donc VIDE — vers {custom:Acompte}, le jeton qui existe. Revenir en arrière, ce serait
   remettre un blanc à la place de l'acompte dans le devis, la convention et le contrat : aucun état
   utile à retrouver.

   Et on ne SAURAIT PAS le faire proprement : après la 183, une puce {custom:Acompte} peut venir de la
   migration comme d'une insertion faite à la main depuis — rien ne les distingue. Un REPLACE inverse
   casserait aussi les secondes.

   Pour annuler malgré tout sur un modèle, l'éditeur suffit : supprimer la puce. */

DO 0;
