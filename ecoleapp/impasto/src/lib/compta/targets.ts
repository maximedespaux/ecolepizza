// Module Comptabilité / Gestion — cibles et règles d'analyse (pas de compta légale).
// Chaque poste de dépense est comparé à une cible en % du CA → code couleur + conseil.

export const EXPENSE_CATEGORIES = [
  "MATIERES_PREMIERES",
  "SALAIRES",
  "LOYER",
  "MARKETING",
  "ENERGIE",
  "DIVERS",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  MATIERES_PREMIERES: "Matières premières",
  SALAIRES: "Salaires & charges",
  LOYER: "Loyer & locaux",
  MARKETING: "Marketing & envois",
  ENERGIE: "Énergie",
  DIVERS: "Divers",
};

// Cibles de départ (ajustables par l'organisme). Valeurs médianes des fourchettes
// du brief : matières 25–30 %, salaires 30 %, loyer 10 %, marketing 5–10 %,
// énergie 5 %, divers 5 %. Dividendes visés 10 %.
export const DEFAULT_TARGETS: Record<ExpenseCategory, number> = {
  MATIERES_PREMIERES: 27.5,
  SALAIRES: 30,
  LOYER: 10,
  MARKETING: 7.5,
  ENERGIE: 5,
  DIVERS: 5,
};

export const DEFAULT_DIVIDENDE_CIBLE = 10;

export type Statut = "vert" | "orange" | "rouge";

// Un poste est vert s'il respecte sa cible, orange jusqu'à +20 % de dépassement
// relatif, rouge au-delà. (Ex. cible 10 % → vert ≤10 %, orange ≤12 %, rouge >12 %.)
export function statutFor(pct: number, cible: number): Statut {
  if (pct <= cible) return "vert";
  if (pct <= cible * 1.2) return "orange";
  return "rouge";
}

export function conseilFor(cat: ExpenseCategory, statut: Statut, pct: number, cible: number): string {
  if (statut === "vert") return `Sous la cible (${cible}%). Marge de manœuvre disponible.`;
  const ecart = Math.round((pct - cible) * 10) / 10;
  if (statut === "orange") return `Léger dépassement (+${ecart} pts). À surveiller.`;
  const conseils: Record<ExpenseCategory, string> = {
    MATIERES_PREMIERES: "Renégocier avec les fournisseurs partenaires ou réduire le gaspillage.",
    SALAIRES: "Poste lourd : vérifier le taux de remplissage des sessions avant d'embaucher.",
    LOYER: "Loyer élevé vs CA : envisager un local mutualisé ou renégocier le bail.",
    MARKETING: "Recentrer le budget sur les canaux qui convertissent réellement.",
    ENERGIE: "Contrôler la consommation des fours et comparer les contrats d'énergie.",
    DIVERS: "Trop de dépenses non classées : les ventiler dans les bons postes.",
  };
  return `Dépassement notable (+${ecart} pts). ${conseils[cat]}`;
}

// Fusionne des cibles enregistrées (partielles / typées large) avec les défauts.
export function mergeTargets(saved?: Record<string, unknown> | null): Record<ExpenseCategory, number> {
  const out = { ...DEFAULT_TARGETS };
  if (saved) {
    for (const cat of EXPENSE_CATEGORIES) {
      const v = saved[cat];
      if (typeof v === "number" && v >= 0 && v <= 100) out[cat] = v;
    }
  }
  return out;
}
