// Règles métier de la génération documentaire (point 6 du cahier des charges)
// + assemblage des variables de fusion (équivalent de la feuille « Convert Data »).
//
// Types locaux volontairement découplés de Prisma pour rester testables et
// vérifiables hors application. Dans l'app, on mappe les enums Prisma vers ces
// chaînes (« PARTICULIER » / « PROFESSIONNEL »).

import type { MergeData } from "./tokens";
import { ECOLE_PIZZA, type Organisme } from "../ecole-pizza/organisme";

export type Financement = "PARTICULIER" | "PROFESSIONNEL";

export interface FormationLike {
  code: string;
  titre: string;
  jours: number;
  heures: number;
  prix: number;
  public?: string;
  objectifs?: string;
  objectifGeneral?: string;
  deroule?: string;
  dureeDetail?: string;
  hygiene: boolean;
  rsCode?: string | null;
}

export interface StagiaireLike {
  civilite?: string | null;
  nom: string;
  prenom?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
  dateNaissance?: Date | null;
  financement: Financement;
  acompte?: number | null;
}

export interface EntrepriseLike {
  nom: string;
  siret?: string | null;
  civRepresentant?: string | null;
  nomRepresentant?: string | null;
}

// --------------------------- Règles de sélection ----------------------------

export function choixDevis(financement: Financement, formation: FormationLike): string {
  if (formation.code === "RS7404") return "Devis RS7404";
  if (financement === "PARTICULIER") return "Devis Particulier";
  return "Devis Entreprise";
}

export function choixContratConvention(financement: Financement): string {
  if (financement === "PARTICULIER") return "Contrat de formation";
  return "Convention de formation";
}

export function choixEmargement(formation: FormationLike): string {
  if (formation.hygiene) return "Feuille d'émargement 5J + hygiène";
  return `Feuille d'émargement ${formation.jours}J`;
}

export function inclureConvocation(formation: FormationLike): string {
  return formation.code === "RS7404" ? "Convocation examen" : "Invitation";
}

// --------------------------- Dates de session -------------------------------

/** Lundi (UTC) de la semaine ISO d'une année donnée. */
export function mondayOfISOWeek(annee: number, semaine: number): Date {
  const simple = new Date(Date.UTC(annee, 0, 1 + (semaine - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - dow + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - dow);
  return monday;
}

function frDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

/** { debut, fin } d'une session à partir de l'année, la semaine et la durée. */
export function sessionDates(annee: number, semaine: number, jours: number) {
  const debut = mondayOfISOWeek(annee, semaine);
  const fin = new Date(debut);
  fin.setUTCDate(debut.getUTCDate() + (jours - 1));
  return { debut, fin, debutFr: frDate(debut), finFr: frDate(fin) };
}

// ----------------------- Assemblage des variables ---------------------------

const euro = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

export interface AssembleInput {
  organisme?: Organisme;
  stagiaire: StagiaireLike;
  formation: FormationLike;
  entreprise?: EntrepriseLike | null;
  annee: number;
  semaine: number;
}

/** Construit la table de fusion { Jeton: valeur } injectée dans les templates. */
export function assembleVariables(input: AssembleInput): MergeData {
  const { stagiaire: s, formation: f, entreprise: e } = input;
  const org = input.organisme ?? ECOLE_PIZZA;
  const { debut, debutFr, finFr } = sessionDates(input.annee, input.semaine, f.jours);

  const adresse = [s.adresse, [s.codePostal, s.ville].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");

  const data: MergeData = {
    Personne: [s.civilite, s.nom, s.prenom].filter(Boolean).join(" "),
    Nom: s.nom,
    "Prénom": s.prenom ?? "",
    Adresse: adresse,
    Formation: f.titre,
    "Niveau suggérer": f.titre,
    "Semaine de la formation": String(input.semaine),
    Date: `du ${debutFr} au ${finFr}`,
    endDate: finFr,
    Today: frDate(new Date()),
    Heures: `${f.heures} h`,
    TmpTotSem: `${f.heures} h`,
    Jours: `${f.jours} jours`,
    Prix: euro(f.prix),
    Public: f.public ?? "",
    Objectifs: f.objectifs ?? "",
    ObjectifG: f.objectifGeneral ?? "",
    "Déroulé": f.deroule ?? "",
    "DuréeDétail": f.dureeDetail ?? org.horairesType,
    Offre: "Offre valable 30 jours.",
  };

  // Dates des jours d'émargement (Lundi → Vendredi) de la semaine de formation.
  const jourNoms = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
  for (let i = 0; i < Math.min(f.jours, 5); i++) {
    const d = new Date(debut);
    d.setUTCDate(debut.getUTCDate() + i);
    data[jourNoms[i]] = frDate(d);
  }

  if (s.telephone) data["Téléphone"] = s.telephone;
  if (s.email) data.Email = s.email;
  if (s.acompte != null) data.Acompte = euro(s.acompte);
  if (s.dateNaissance) data.D_Naissance = frDate(s.dateNaissance);

  if (e) {
    data["Nom entreprise"] = e.nom;
    if (e.siret) data.Siret = e.siret;
    if (e.civRepresentant) data["Civ représentant"] = e.civRepresentant;
    if (e.nomRepresentant) data["Nom représentant"] = e.nomRepresentant;
  }

  return data;
}
