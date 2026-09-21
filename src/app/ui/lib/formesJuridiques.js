/**
 * LES FORMES JURIDIQUES, EN CAPITALES — celles qu'un organisme de formation (ou une petite
 * entreprise) peut avoir en France.
 *
 * LA VALEUR ENREGISTRÉE EST LE SIGLE (« SAS », « SARL »…) : c'est lui que le jeton {Forme juridique
 * organisme} imprime sur les documents, tel qu'on l'écrit sur un papier à en-tête. Le libellé qui
 * l'accompagne dans la liste sert à CHOISIR — « SELAS » ne se devine pas — et ne s'imprime nulle part.
 *
 * Rangées de la plus courante à la plus rare pour un organisme de formation : entreprise
 * individuelle et micro-entreprise d'abord (l'École Pizza est une EI), sociétés ensuite, formes
 * coopératives, libérales et publiques en dernier.
 */
export const FORMES_JURIDIQUES = [
  ["EI", "Entreprise individuelle"],
  ["MICRO-ENTREPRISE", "Micro-entreprise (auto-entrepreneur)"],
  ["EIRL", "Entreprise individuelle à responsabilité limitée"],
  ["EURL", "Entreprise unipersonnelle à responsabilité limitée"],
  ["SARL", "Société à responsabilité limitée"],
  ["SASU", "Société par actions simplifiée unipersonnelle"],
  ["SAS", "Société par actions simplifiée"],
  ["SA", "Société anonyme"],
  ["SNC", "Société en nom collectif"],
  ["SCOP", "Société coopérative et participative"],
  ["SCIC", "Société coopérative d'intérêt collectif"],
  ["SCI", "Société civile immobilière"],
  ["SELARL", "Société d'exercice libéral à responsabilité limitée"],
  ["SELAS", "Société d'exercice libéral par actions simplifiée"],
  ["GIE", "Groupement d'intérêt économique"],
  ["ASSOCIATION LOI 1901", "Association"],
  ["ÉTABLISSEMENT PUBLIC", "GRETA, CFA public, université…"],
];
