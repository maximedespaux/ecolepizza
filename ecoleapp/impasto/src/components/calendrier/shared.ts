// Types & helpers partagés du module Calendrier / Pipeline (Phase 1).

export interface Program {
  id: string;
  code: string;
  titre: string;
  jours: number;
  heures?: number;
  prix?: string | number;
}

export interface LearnerLite {
  id: string;
  civilite?: string | null;
  nom: string;
  prenom?: string | null;
  ville?: string | null;
  email?: string | null;
  company?: { raisonSociale?: string | null } | null;
}

export interface EnrollmentRow {
  id: string;
  learnerId: string;
  sessionId: string;
  crmStage: string;
  financement: string;
  prix?: string | number | null;
  learner: LearnerLite;
}

export interface SessionRow {
  id: string;
  annee: number;
  semaine: number;
  dateDebut: string | null;
  dateFin: string | null;
  status: string;
  program: Program;
  _count?: { enrollments: number };
}

export interface SessionDetail extends SessionRow {
  enrollments: EnrollmentRow[];
}

// Couleurs par formation (charte École Pizza).
const COLORS: Record<string, string> = {
  NIV1: "#C1272D", NIV1H: "#E0512B", NIV1PRO: "#D98A1F", NIV2: "#B4552E",
  NIV2C: "#8E5A2D", EXPERT: "#5B7C99", NAPO: "#3E7C5A", TEGLIA: "#7A5C99", RS7404: "#16243D",
};
export const colorOf = (code: string) => COLORS[code] ?? "#6E6453";

export const STATUS_LABEL: Record<string, string> = {
  PLANIFIEE: "Planifiée", CONFIRMEE: "Confirmée", EN_COURS: "En cours",
  TERMINEE: "Terminée", ANNULEE: "Annulée",
};
// Classe de badge (.g/.a/.b/.r/.n) associée à chaque statut de session.
export const STATUS_BADGE: Record<string, string> = {
  PLANIFIEE: "n", CONFIRMEE: "b", EN_COURS: "a", TERMINEE: "g", ANNULEE: "r",
};
export const SESSION_STATUSES = ["PLANIFIEE", "CONFIRMEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;

export const FINANCEMENT_LABEL: Record<string, string> = {
  PARTICULIER: "Particulier", PROFESSIONNEL: "Professionnel / OPCO",
};

// Pipeline CRM : colonnes ordonnées du Kanban.
export const CRM_STAGES: { value: string; label: string; badge: string }[] = [
  { value: "PROSPECT", label: "Prospect", badge: "n" },
  { value: "CONTACTE", label: "Contacté", badge: "n" },
  { value: "DEVIS_ENVOYE", label: "Devis envoyé", badge: "b" },
  { value: "DEVIS_SIGNE", label: "Devis signé", badge: "b" },
  { value: "ACOMPTE_PAYE", label: "Acompte payé", badge: "a" },
  { value: "INSCRIT", label: "Inscrit", badge: "a" },
  { value: "EN_FORMATION", label: "En formation", badge: "a" },
  { value: "TERMINE", label: "Terminé", badge: "g" },
  { value: "EVALUATION_ENVOYEE", label: "Évaluation envoyée", badge: "g" },
  { value: "ARCHIVE", label: "Archivé", badge: "n" },
];
export const CRM_LABEL: Record<string, string> = Object.fromEntries(CRM_STAGES.map((s) => [s.value, s.label]));

export const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

// Lundi d'une semaine ISO donnée (pour la vue Semaine).
export function mondayOfISOWeek(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  return monday;
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const frDate = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

// Plage de dates d'une session, robuste : utilise dateDebut/dateFin si présents
// (accepte string venue de l'API ou Date venue de Prisma), sinon les déduit de
// l'année + semaine ISO + durée du programme.
const toIsoDay = (v: string | Date | null): string | null =>
  v == null ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);

export function sessionRange(s: {
  dateDebut: string | Date | null; dateFin: string | Date | null;
  annee: number; semaine: number; program: { jours: number };
}): { start: string; end: string } {
  const start = toIsoDay(s.dateDebut), end = toIsoDay(s.dateFin);
  if (start && end) return { start, end };
  const monday = mondayOfISOWeek(s.annee, s.semaine);
  const fin = new Date(monday);
  fin.setUTCDate(monday.getUTCDate() + Math.max(0, (s.program.jours ?? 1) - 1));
  return { start: iso(monday), end: iso(fin) };
}
export const learnerName = (l: LearnerLite) => [l.prenom, l.nom].filter(Boolean).join(" ") || l.nom;
export const initials = (l: LearnerLite) =>
  ((l.prenom?.[0] ?? "") + (l.nom?.[0] ?? "")).toUpperCase() || (l.nom?.[0]?.toUpperCase() ?? "?");
