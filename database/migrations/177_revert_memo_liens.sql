/* 177_revert_memo_liens.sql
   Retour arrière de la 177 : les liens des mémos disparaissent.

   ⚠️ CE QUI SE PERD : tous les liens écrits avec @ et # — vers un stagiaire, une entreprise, un
   membre, une session, un partenaire, une facture. Les MÉMOS restent, avec leur texte intact : la
   phrase tapée n'a jamais dépendu de cette table. Ce qui part avec elle, ce sont les fiches qu'ils
   désignaient, et les mémos qu'un collègue voyait parce qu'il y était mentionné — ceux-là
   redeviennent privés pour leur auteur, sauf s'ils sont partagés avec l'équipe.

   Sans risque si la 177 n'a jamais été jouée. */
DROP TABLE IF EXISTS memo_lien;
