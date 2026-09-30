/**
 * LES LIGNES D'UNE FACTURE, CHOISIES PAR SESSION (demandé le 2026-09-30).
 *
 * Une ligne se rattachait à un dossier par une liste de TOUS les dossiers de l'organisme. On coche
 * maintenant les stagiaires d'une session, et chaque case cochée EST une ligne : c'est la liste des
 * lignes qui fait foi, les cases ne font que la lire. Décocher retire la ligne ; changer de semaine
 * garde les lignes déjà prises, ce qui permet de facturer à une entreprise des stagiaires de deux
 * sessions.
 *
 * Tout est PUR (ni React ni réseau) : factures-par-session.test.js l'éprouve directement.
 */
import { montantEnSaisie } from "./montantSaisi.js";

/** La ligne d'un dossier : son montant par défaut (prix du dossier, sinon tarif de la formation),
 *  écrit comme on le tape — « 1234,5 » : le champ est en texte, et lireMontant le relit. */
export const ligneDuDossier = (d) => ({
  enrollment_id: d.enrollment_id,
  description: "",
  amount_net: d.montant > 0 ? montantEnSaisie(d.montant) : "",
});

export const estCoche = (lignes, d) => lignes.some((l) => l.enrollment_id && l.enrollment_id === d.enrollment_id);

/** Cocher ajoute la ligne du dossier, décocher la retire — la seule ligne à lui. */
export function basculer(lignes, d) {
  return estCoche(lignes, d)
    ? lignes.filter((l) => l.enrollment_id !== d.enrollment_id)
    : [...lignes, ligneDuDossier(d)];
}

/**
 * « Tout cocher » ne prend que ce qui n'est NI FACTURÉ NI SUR UN BROUILLON : le reprendre le ferait
 * payer deux fois — un brouillon est une facture qu'on n'a pas encore émise. Un tel stagiaire se
 * coche à la main, quand c'est voulu (solde après acompte). « Tout décocher » retire tous ceux de
 * la liste.
 */
export const aFacturer = (dossiers) => dossiers.filter((d) => !d.factures && !d.brouillons);

export function toutCocher(lignes, dossiers, cocher) {
  if (!cocher) {
    const ids = new Set(dossiers.map((d) => d.enrollment_id));
    return lignes.filter((l) => !ids.has(l.enrollment_id));
  }
  return aFacturer(dossiers).reduce((acc, d) => (estCoche(acc, d) ? acc : [...acc, ligneDuDossier(d)]), lignes);
}

/** La case « Tout cocher » est cochée quand tout ce qui reste à facturer l'est déjà. */
export const toutEstCoche = (lignes, dossiers) => {
  const reste = aFacturer(dossiers);
  return reste.length > 0 && reste.every((d) => estCoche(lignes, d));
};
