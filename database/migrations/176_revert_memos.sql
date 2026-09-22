/* 176_revert_memos.sql
   Retour arrière de la 176 : la table des mémos disparaît.

   ⚠️ CE QUI SE PERD : TOUS les mémos, privés et partagés, faits ou non. Ils ne vivent nulle part
   ailleurs. Relever d'abord ce qui doit l'être.

   Après ce revert, le code se comporte comme avant la 176 : le bouton de la barre du haut et la
   carte du tableau de bord disent que les mémos ne sont pas encore disponibles, et n'écrivent rien. */
DROP TABLE IF EXISTS memo;
