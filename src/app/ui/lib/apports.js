// Types d'apports partenaire (commission cash → CA, ou contribution en nature → suivi).
// MAQUETTE : stockage local le temps de valider l'ergonomie, à brancher en base ensuite.

export const APPORT_TYPES = [
  { v: "COMMISSION", label: "Commission", tone: "g", cash: true },
  { v: "SUBVENTION", label: "Subvention", tone: "g", cash: true },
  { v: "AUTRE", label: "Autre produit", tone: "b", cash: true },
  { v: "MATERIEL", label: "Matériel", tone: "b", cash: false },
  { v: "EQUIPEMENT", label: "Équipement", tone: "a", cash: false },
  { v: "CONSOMMABLE", label: "Consommable", tone: "n", cash: false },
];

export const apportType = (v) => APPORT_TYPES.find((t) => t.v === v) || APPORT_TYPES[0];

const LS_KEY = "impasto.partnerContribMock";

export function loadApports() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
export function saveApports(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/**
 * Apports d'un partenaire, fusionnés et triés (récents d'abord) :
 *  · commissions réelles (données API `p.commissions`) marquées `real`,
 *  · apports de la maquette (localStorage) filtrés par partenaire.
 */
export function apportsOfPartner(p, mockItems) {
  const real = (p?.commissions || []).map((c) => ({
    id: `r:${c.id}`, srcId: c.id, real: true,
    type: "COMMISSION", label: c.label, value: Number(c.amount) || 0, date: c.date,
  }));
  const mock = (mockItems || [])
    .filter((a) => String(a.partner_id) === String(p?.id))
    .map((a) => ({ ...a, real: false }));
  return [...real, ...mock].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
