// Registre des 24 templates Word de l'École Pizza : pour chaque type de document,
// le(s) fichier(s) modèle, la condition d'application, les jetons attendus et les
// signataires par défaut (niveau de signature + authentification).

import type { Token } from "./tokens";

export type SignatureLevel = "SIMPLE" | "AVANCEE" | "QUALIFIEE";
export type SignatureAuth = "OTP_EMAIL" | "OTP_SMS";
export type RecipientRole = "STAGIAIRE" | "ENTREPRISE" | "ORGANISME";

export interface TemplateDef {
  type: string;            // DocumentType (cf. schema.prisma)
  num: string;             // préfixe de numérotation
  label: string;
  files: string[];         // .docx modèle(s) (variantes)
  variables: Token[];
  signable: boolean;
  signers?: RecipientRole[];
  level?: SignatureLevel;
  auth?: SignatureAuth;
  onlyHygiene?: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  {
    type: "FICHE_SEMAINE", num: "2", label: "Fiche d'expression de besoin",
    files: ["Fiche Semaine.docx"], variables: [], signable: false,
  },
  {
    type: "TEST_POSITIONNEMENT", num: "3", label: "Test de positionnement",
    files: ["Testez vos connaissances en hygiène.docx"], variables: [], signable: false,
  },
  {
    type: "DEVIS", num: "4", label: "Devis",
    files: ["Devis Particulier_.docx", "Devis Entreprise.docx", "Devis Fabriquer des pizzas artisanales RS7404.docx"],
    variables: ["Semaine de la formation", "Niveau suggérer", "Personne", "Adresse", "Date", "Heures", "Jours", "DuréeDétail", "Déroulé", "Objectifs", "Public", "Prix", "Offre", "Acompte", "Nom entreprise", "Today"],
    signable: true, signers: ["ORGANISME", "STAGIAIRE"], level: "SIMPLE", auth: "OTP_EMAIL",
  },
  {
    type: "CONTRAT", num: "5", label: "Contrat / Convention de formation",
    files: ["Contrat.docx", "Convention.docx", "Contrat Fabriquer des pizzas artisanales RS7404.docx"],
    variables: ["Personne", "Adresse", "Niveau suggérer", "Date", "Heures", "Jours", "DuréeDétail", "Déroulé", "Objectifs", "ObjectifG", "Prix", "Acompte", "Nom entreprise", "Siret", "Civ représentant", "Nom représentant", "Today"],
    signable: true, signers: ["ORGANISME", "STAGIAIRE", "ENTREPRISE"], level: "AVANCEE", auth: "OTP_SMS",
  },
  {
    type: "CONVOCATION", num: "6", label: "Convocation à l'examen (RS7404)",
    files: ["Convocation.docx"], variables: ["Personne", "Adresse", "endDate"],
    signable: false,
  },
  {
    type: "INVITATION", num: "6", label: "Invitation",
    files: ["Invitation.docx"], variables: ["Personne", "Adresse", "Niveau suggérer", "Date", "DuréeDétail"],
    signable: false,
  },
  {
    type: "DROIT_IMAGE", num: "7", label: "Droit à l'image",
    files: ["Droit Image.docx"], variables: ["Personne", "Adresse", "Email", "Téléphone"],
    signable: true, signers: ["STAGIAIRE"], level: "SIMPLE", auth: "OTP_EMAIL",
  },
  {
    type: "EMARGEMENT", num: "8", label: "Feuille d'émargement",
    files: ["Feuille d_émargement 2J.docx", "Feuille d_émargement 3J.docx", "Feuille d_émargement 4J.docx", "Feuille d_émargement 5J.docx", "Feuille d_émargement 5J + hygiène.docx"],
    variables: [], signable: false,
  },
  {
    type: "ATTESTATION_HYGIENE", num: "9", label: "Attestation Hygiène",
    files: ["Attestation Hygiène.docx"], variables: ["Personne", "D_Naissance"],
    signable: false, onlyHygiene: true,
  },
  {
    type: "CERTIFICAT_REALISATION", num: "10", label: "Certificat de réalisation",
    files: ["Certificat de réalisation.docx"], variables: ["Personne", "Niveau suggérer", "Date", "Heures", "Today"],
    signable: true, signers: ["ORGANISME"], level: "SIMPLE", auth: "OTP_EMAIL",
  },
  {
    type: "EVALUATION_FINANCEUR", num: "11", label: "Évaluation Financeur",
    files: ["Évaluation Financeur.docx"], variables: [], signable: false,
  },
  {
    type: "EVALUATION_MANAGEUR", num: "11", label: "Évaluation Manageur",
    files: ["Évaluation Manageur.docx"], variables: [], signable: false,
  },
  {
    type: "CGV", num: "1", label: "Conditions générales de vente",
    files: ["CGV.docx"], variables: [], signable: false,
  },
];

/** Jeu de documents applicable à une formation (filtre l'hygiène). */
export function templatesForFormation(hygiene: boolean): TemplateDef[] {
  return TEMPLATES.filter((t) => !t.onlyHygiene || hygiene);
}

// ---------------------------------------------------------------------------
// Jeu de documents ordonné (1 → 11) pour un dossier, avec application des
// règles : Devis Particulier/Entreprise/RS7404, Contrat vs Convention,
// Convocation (RS) vs Invitation, Émargement selon durée, Hygiène conditionnelle.

export interface DocItem {
  num: number;
  type: string;       // DocumentType (cf. schema.prisma)
  label: string;
  signable: boolean;
}

export interface DocSetOptions {
  hygiene: boolean;
  rsCode?: string | null;
  jours: number;
  financement: "PARTICULIER" | "PROFESSIONNEL";
}

export function documentSetFor(o: DocSetOptions): DocItem[] {
  const devisLabel = o.rsCode
    ? "Devis RS7404"
    : o.financement === "PARTICULIER" ? "Devis particulier" : "Devis entreprise";
  const contratLabel = o.financement === "PARTICULIER"
    ? "Contrat de formation" : "Convention de formation";
  const emarg = o.hygiene
    ? "Feuille d'émargement 5J + hygiène"
    : `Feuille d'émargement ${o.jours}J`;

  const list: Omit<DocItem, "num">[] = [
    { type: "PROGRAMME", label: "Programme de formation", signable: false },
    { type: "FICHE_SEMAINE", label: "Fiche d'expression de besoin", signable: false },
    { type: "TEST_POSITIONNEMENT", label: "Test de positionnement", signable: false },
    { type: "DEVIS", label: devisLabel, signable: true },
    { type: "CONTRAT", label: contratLabel, signable: true },
    o.rsCode
      ? { type: "CONVOCATION", label: "Convocation à l'examen", signable: false }
      : { type: "INVITATION", label: "Invitation", signable: false },
    { type: "DROIT_IMAGE", label: "Droit à l'image", signable: true },
    { type: "EMARGEMENT", label: emarg, signable: false },
  ];
  if (o.hygiene) list.push({ type: "ATTESTATION_HYGIENE", label: "Attestation Hygiène", signable: false });
  list.push({ type: "CERTIFICAT_REALISATION", label: "Certificat de réalisation", signable: true });
  list.push({ type: "EVALUATION_FINANCEUR", label: "Évaluations (chaud / froid)", signable: false });

  return list.map((d, i) => ({ num: i + 1, ...d }));
}
