/**
 * LE CADRE DE LA SIGNATURE DU STAGIAIRE, CÔTÉ ÉDITEUR (2026-09-25).
 *
 * Deux formes se remplissent de sa signature au rendu (src/api/lib/htmlfill.js) : le jeton intégré
 * « Signature stagiaire », et tout cadre nommé `sig:<créneau>` dont le créneau ou le libellé désigne
 * le stagiaire — « Stagiaire 1 », « élève »… (repli STAG_SLOT). La règle est CASE_STAGIAIRE de
 * src/api/lib/documents.js, recopiée ici à l'identique ; un test refuse qu'elles divergent.
 */
export const CASE_STAGIAIRE = /(stagiaire|eleve|élève|apprenant|participant|candidat|beneficiaire|bénéficiaire)/i;

/** Ce modèle (HTML de l'éditeur) porte-t-il un cadre que la signature du stagiaire remplira ? */
export function aUnCadreStagiaire(html) {
  for (const m of String(html || "").matchAll(/<span\b[^>]*\bdata-token="([^"]+)"[^>]*>/g)) {
    const cle = m[1];
    if (cle === "Signature stagiaire") return true;
    if (cle.startsWith("sig:")) {
      const libelle = (/\bdata-label="([^"]*)"/.exec(m[0]) || [])[1] || "";
      if (CASE_STAGIAIRE.test(`${cle.slice(4)} ${libelle}`)) return true;
    }
  }
  return false;
}
