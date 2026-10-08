/* ============================================================================================
   REVERT 204 — retire le suivi des ouvertures de documents.

   La pastille « Mes documents » cesse de compter les documents de GROUPE reçus mais jamais vus
   (le comportement d'avant la 204). On ne perd qu'un confort d'affichage : aucune preuve, aucun
   document n'est touché — seule la trace des ouvertures disparaît.
   ============================================================================================ */

DROP TABLE IF EXISTS document_vu;
