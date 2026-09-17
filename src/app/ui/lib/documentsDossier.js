/**
 * LES DOCUMENTS D'UN DOSSIER : où ranger chacun, et ce qu'il attend encore.
 *
 * Du JavaScript pur, sans JSX, pour la raison écrite en tête de `etapes.js` : les tests de
 * `src/api/test` peuvent l'importer et l'ÉPROUVER, ce qu'une fonction enfermée dans une page ne
 * permet pas.
 *
 * LE STATUT NE SUFFIT PAS. « Envoyé » veut dire « chez le stagiaire, à signer » pour un contrat,
 * et « terminé » pour un livret d'accueil, qui n'a aucun signataire et ne passera jamais à
 * « Signé ». Ranger au seul statut affichait « 9 signés sur 12 » sur un dossier complet. Qui doit
 * encore agir, c'est le SERVEUR qui le tranche (il connaît les modèles) : `signature_attendue` sur
 * la fiche stagiaire, `signable` / `company_sign` dans l'espace du stagiaire.
 *
 * UN DRAPEAU ABSENT NE TERMINE RIEN. Les comparaisons sont strictes (`=== false`) : une réponse
 * sans le drapeau — un onglet resté ouvert sur l'ancienne version pendant une mise en ligne —
 * retombe sur l'ancien rangement. Dire « en attente » à tort se corrige au rechargement ; dire
 * « terminé » à tort fait classer un dossier incomplet.
 */

/* Les documents ne sont pas les étapes d'un parcours unique — ce sont N pièces indépendantes,
   chacune dans son état. Six états côte à côte en liste plate n'apprennent donc rien : il fallait
   lire chaque ligne pour savoir où en était le dossier, alors que c'est précisément ce qu'on
   vient y chercher.
   Le regroupement suit QUI A LA BALLE, la seule question que se pose le secrétariat : ce qui
   est sur mon bureau, ce que j'attends du stagiaire, ce qui est clos. « Préparé » et « Généré »
   tombent ensemble parce qu'ils appellent le même geste — envoyer ; « Envoyé » et « Consulté »
   aussi — patienter ou relancer.
   « TERMINÉS », PAS « SIGNÉS » : le groupe accueille aussi ce qui se remet sans se signer. C'est le
   mot du parcours juste au-dessus, qui compte déjà ces documents comme faits dès l'envoi. */
export const GROUPES_DOC = [
  { cle: "faire",   titre: "À envoyer",         aide: "sur votre bureau",        ton: "ember", etats: ["A_FAIRE", "GENERE"] },
  { cle: "attente", titre: "Chez le stagiaire", aide: "en attente de signature", ton: "gold",  etats: ["ENVOYE", "CONSULTE"] },
  { cle: "fait",    titre: "Terminés",          aide: "rien à faire",            ton: "green", etats: ["SIGNE", "ARCHIVE"] },
];

/** Le document part-il sans qu'on attende de signature (livret, règlement, CGV, convocation) ? */
export const sansSignature = (d) => !!d && d.signature_attendue === false;

/** Clé du groupe d'un document (fiche stagiaire). */
export function groupeDuDocument(d) {
  // Parti, et personne n'a à le signer : il n'est chez personne, il est remis.
  if (sansSignature(d) && GROUPES_DOC.find((g) => g.cle === "attente").etats.includes(d.status)) return "fait";
  // Un état inconnu tombe dans « à envoyer » plutôt que de disparaître : mieux vaut un
  // document rangé au mauvais endroit qu'un document invisible.
  const g = GROUPES_DOC.find((x) => x.etats.includes(d.status));
  return g ? g.cle : "faire";
}

/** Répartition complète : { faire: [...], attente: [...], fait: [...] }, ordre conservé. */
export function repartirDocuments(docs) {
  const m = Object.fromEntries(GROUPES_DOC.map((g) => [g.cle, []]));
  for (const d of docs || []) m[groupeDuDocument(d)].push(d);
  return m;
}

/**
 * État d'un document dans le PARCOURS VU PAR LE STAGIAIRE (valeurs de sa pastille) :
 *   · « done » : signé, ou reçu sans rien à signer ;
 *   · « todo » : à lui de jouer — un QCM à remplir, un document à signer ;
 *   · « wait » : c'est l'entreprise qui signe ; lui n'a rien à faire, mais ce n'est pas fini.
 * La liste ne contient que des documents déjà envoyés : un document sans signature y est donc
 * reçu, et rien ne le rendra plus complet.
 */
export function etatPourLeStagiaire(d) {
  if (d.status === "SIGNE") return "done";
  if (d.quiz_id || d.signable !== false) return "todo";
  return d.company_sign ? "wait" : "done";
}
