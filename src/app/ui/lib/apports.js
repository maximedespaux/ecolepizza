// Types d'apports partenaire : commission cash (→ chiffre d'affaires, table revenue_extra)
// ou contribution en nature (matériel/équipement → suivi seul, table partner_contribution).

export const APPORT_TYPES = [
  { v: "COMMISSION", label: "Commission", tone: "g", cash: true },
  { v: "SUBVENTION", label: "Subvention", tone: "g", cash: true },
  { v: "AUTRE", label: "Autre produit", tone: "b", cash: true },
  { v: "MATERIEL", label: "Matériel", tone: "b", cash: false },
  { v: "EQUIPEMENT", label: "Équipement", tone: "a", cash: false },
  { v: "CONSOMMABLE", label: "Consommable", tone: "n", cash: false },
];

export const apportType = (v) => APPORT_TYPES.find((t) => t.v === v) || APPORT_TYPES[0];

/**
 * Apports d'un partenaire, fusionnés et triés (récents d'abord) depuis les données API :
 *  · commissions cash (`p.commissions`, revenue_extra → CA) — `src: "revenue"`,
 *  · contributions en nature (`p.contributions`, partner_contribution) — `src: "contribution"`.
 * `src` + `srcId` permettent d'aiguiller la suppression vers la bonne table.
 */
export function apportsOfPartner(p) {
  const commissions = (p?.commissions || []).map((c) => ({
    id: `re:${c.id}`, srcId: c.id, src: "revenue", real: true,
    // `type` venait d'être écrit en dur à "COMMISSION" : une subvention ou un autre produit
    // s'affichait donc comme une commission. Repli sur COMMISSION seulement si le serveur ne
    // dit rien — une base d'avant l'ajout de `category` à la requête.
    type: c.category || "COMMISSION", label: c.label, value: Number(c.amount) || 0, date: c.date,
  }));
  const contributions = (p?.contributions || []).map((c) => ({
    id: `pc:${c.id}`, srcId: c.id, src: "contribution", real: true,
    type: c.type || "MATERIEL", label: c.label, value: Number(c.value) || 0, date: c.date,
  }));
  return [...commissions, ...contributions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * « septembre 2026 » : le mois où un apport paraît en Comptabilité — celui de SA DATE, pas du jour
 * de la saisie. La Comptabilité s'ouvre sur le mois courant : un apport daté de juillet n'y paraît
 * qu'en juillet, et c'est ce que le formulaire dit après l'enregistrement.
 * La date se lit en texte (AAAA-MM-JJ), sans `new Date` : lue en UTC, elle reculerait d'un jour
 * sur un fuseau négatif, et le 1er du mois passerait au mois d'avant.
 */
export function moisDeLApport(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ""));
  const nom = m ? MOIS[Number(m[2]) - 1] : null;
  return nom ? `${nom} ${m[1]}` : "";
}
