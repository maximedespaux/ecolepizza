// Score de conformité d'un dossier à partir des statuts de ses documents.
// VERT  : tout est généré et les documents signables sont signés.
// ORANGE: dossier entamé mais incomplet.
// ROUGE : rien de produit.

export type Conformite = "VERT" | "ORANGE" | "ROUGE";

export function computeConformite(
  docs: { signable: boolean; status: string }[]
): Conformite {
  if (docs.length === 0) return "ROUGE";
  const isDone = (d: { signable: boolean; status: string }) =>
    d.signable ? d.status === "SIGNE" : ["GENERE", "ENVOYE", "SIGNE"].includes(d.status);
  const done = docs.filter(isDone).length;
  if (done === 0) return "ROUGE";
  if (done === docs.length) return "VERT";
  return "ORANGE";
}
