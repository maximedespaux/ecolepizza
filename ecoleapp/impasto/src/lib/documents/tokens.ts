// Jetons de fusion utilisés dans les templates Word, au format { Champ }.
// ⚠️ L'orthographe DOIT rester identique aux .docx (ex. « Niveau suggérer »,
// « Siret » sans accent). docxtemplater sera configuré avec les délimiteurs { }.

export const TOKENS = [
  "Personne",
  "Adresse",
  "Téléphone",
  "Email",
  "Semaine de la formation",
  "Niveau suggérer",
  "Date",
  "endDate",
  "Today",
  "Heures",
  "Jours",
  "DuréeDétail",
  "Déroulé",
  "Objectifs",
  "ObjectifG",
  "Public",
  "Prix",
  "Offre",
  "Acompte",
  "Nom entreprise",
  "Siret",
  "Civ représentant",
  "Nom représentant",
  "D_Naissance",
  // Émargement & divers (présents dans les vrais modèles Word)
  "Nom",
  "Prénom",
  "Formation",
  "TmpTotSem",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
] as const;

export type Token = (typeof TOKENS)[number];

// Une table de fusion = chaque jeton → sa valeur déjà formatée (chaîne).
export type MergeData = Partial<Record<Token, string>>;

// Configuration des délimiteurs pour docxtemplater (accolades simples).
export const DOCXTEMPLATER_DELIMITERS = { start: "{", end: "}" } as const;
