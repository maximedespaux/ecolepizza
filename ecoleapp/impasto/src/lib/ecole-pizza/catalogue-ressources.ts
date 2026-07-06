// ============================================================================
// RESSOURCES PÉDAGOGIQUES — construites à partir des SOMMAIRES RÉELS des
// manuels techniques de l'École Pizza (extraction des signets PDF, 07/2026).
// Chaque formation = une liste de modules ; chaque module = des leçons.
// `type` : theorie | pratique | quiz | lexique  → sert à l'affichage (icône,
// progression) dans l'espace stagiaire.
// ============================================================================

export type TypeLecon = "theorie" | "pratique" | "quiz" | "lexique";
export interface Lecon { titre: string; type: TypeLecon; }
export interface ModuleRessource { titre: string; lecons: Lecon[]; }

const T = (titre: string): Lecon => ({ titre, type: "theorie" });
const P = (titre: string): Lecon => ({ titre, type: "pratique" });
const Q = (titre: string): Lecon => ({ titre, type: "quiz" });
const L = (titre: string): Lecon => ({ titre, type: "lexique" });

// Blocs communs réutilisés (issus des manuels Niveau I / RS7404 / I Pro)
const MOD_MATIERES: ModuleRessource = {
  titre: "Les matières premières",
  lecons: [T("L'histoire de la pizza"), T("Les céréales (avec/sans gluten)"), T("Le blé tendre et le blé dur"), T("Le caryopse (le grain)"), T("Le gluten"), T("L'évolution des moutures")],
};
const MOD_FARINE: ModuleRessource = {
  titre: "La farine",
  lecons: [T("Fabrication de la farine"), T("La qualité de la farine"), T("Le sac de farine et le stockage"), T("Les types de farine (raffinage)"), T("L'indice de force de la farine (W)")],
};
const MOD_INGREDIENTS: ModuleRessource = {
  titre: "Eau, levure, sel & huile",
  lecons: [T("La levure"), T("L'eau (H₂O)"), T("Le calcul de la température de l'eau"), T("Le sel"), T("L'huile"), T("Les unités de calcul")],
};
const MOD_HYGIENE: ModuleRessource = {
  titre: "Hygiène & cadre réglementaire",
  lecons: [T("Cadre réglementaire"), T("L'information au consommateur (carte, tableau, support numérique)"), P("Bonnes pratiques d'hygiène")],
};
const MOD_ACCUEIL: ModuleRessource = {
  titre: "Accueil & posture professionnelle",
  lecons: [T("Préface"), P("La tenue professionnelle"), T("Schéma des formations")],
};
const MOD_FIN: ModuleRessource = {
  titre: "Pour aller plus loin",
  lecons: [L("Lexique du pizzaïolo"), T("L'équipe École Pizza")],
};

export const RESSOURCES: Record<string, ModuleRessource[]> = {
  // Niveau I — Pizza Classique
  NIV1: [
    MOD_ACCUEIL, MOD_MATIERES, MOD_FARINE, MOD_INGREDIENTS,
    { titre: "Les protocoles d'empâtement", lecons: [P("Protocole d'empâtement direct"), P("Protocole de l'autolyse"), P("Protocole d'empâtement semi-direct"), T("Les adjonctions"), T("Les substitutions")] },
    MOD_HYGIENE, MOD_FIN,
  ],
  // Niveau I PRO
  NIV1PRO: [
    MOD_ACCUEIL, MOD_MATIERES,
    { titre: "La farine en détail", lecons: [T("La farine"), T("Fabrication de la farine"), T("La qualité de la farine"), T("Le sac de farine"), T("Le type de farine (raffinage)"), T("Indice de force de la farine (W)")] },
    MOD_INGREDIENTS,
    { titre: "Les protocoles d'empâtement", lecons: [P("Protocole d'empâtement"), P("Protocole de l'autolyse"), P("Empâtement direct"), P("Empâtement semi-direct"), T("Les substitutions"), T("Les adjonctions")] },
    MOD_FIN,
  ],
  // Fabriquer des pizzas artisanales (RS7404) — miroir du Niveau I
  RS7404: [
    MOD_ACCUEIL, MOD_MATIERES, MOD_FARINE, MOD_INGREDIENTS,
    { titre: "Les protocoles d'empâtement", lecons: [P("Protocole d'empâtement direct"), P("Protocole de l'autolyse"), P("Protocole d'empâtement semi-direct"), T("Les adjonctions"), T("Les substitutions")] },
    MOD_HYGIENE,
    { titre: "Certification RS7404", lecons: [T("Cadre de la certification"), P("Mise en situation professionnelle"), Q("Épreuve — entretien avec le jury")] },
    MOD_FIN,
  ],
  // Niveau II — Empâtements indirects
  NIV2: [
    MOD_ACCUEIL,
    { titre: "Rappels matières premières", lecons: [T("Le type de farine (raffinage)"), T("Indice de force de la farine (W)"), T("La levure"), T("L'eau (H₂O)"), T("Le sel"), T("L'huile"), T("Unités de calcul")] },
    { titre: "Poolish & Biga", lecons: [T("Poolish & Biga — principes"), P("Poolish — protocole d'empâtement"), P("Biga — protocole d'empâtement"), T("Les substitutions"), T("Les adjonctions")] },
    { titre: "La pizza contemporaine", lecons: [T("Pizza contemporaine vs napolitaine"), P("Méthodologie de l'empâtement contemporain"), T("Différences entre empâtements")] },
    { titre: "Évaluation", lecons: [Q("Quiz : le type de farine")] },
    MOD_FIN,
  ],
  // Spécialisation In Teglia & In Pala
  TEGLIA: [
    MOD_ACCUEIL,
    { titre: "Rappels matières premières", lecons: [T("Le type de farine (raffinage)"), T("Indice de force de la farine (W)"), T("La levure"), T("L'eau (H₂O)"), T("Le sel"), T("L'huile"), T("Les substitutions"), T("Les adjonctions")] },
    { titre: "Matériel & cuisson", lecons: [T("Les pétrins"), T("La cuisson de la pizza")] },
    { titre: "In Teglia & In Pala", lecons: [T("In Teglia & In Pala — principes"), P("In Teglia (pizza en plaque)"), P("In Pala (pizza à la pelle)")] },
    MOD_FIN,
  ],
  // Niveau Expert
  EXPERT: [
    MOD_ACCUEIL,
    { titre: "Matières premières avancées", lecons: [T("Le type de farine (raffinage)"), T("Indice de force de la farine (W)"), T("La levure"), T("L'eau (H₂O)"), T("Le sel"), T("L'huile"), T("Les substitutions"), T("Les adjonctions")] },
    { titre: "Poolish & Biga", lecons: [T("Poolish & Biga — principes"), P("Poolish — protocole"), P("Biga — protocole"), P("Recette contemporaine en direct")] },
    { titre: "In Teglia & In Pala", lecons: [T("In Teglia & In Pala — principes"), P("In Teglia"), P("In Pala")] },
    MOD_FIN,
  ],
  // Napolitaine — manuel dédié à fournir (structure provisoire, à compléter)
  NAPO: [
    MOD_ACCUEIL,
    { titre: "Empâtement napolitain (à compléter avec le manuel)", lecons: [T("Farine napolitaine & AVPN"), P("Empâtement direct napolitain"), P("Staglio & maturation"), P("Cuisson haute température / feu de bois")] },
    MOD_FIN,
  ],
};

// Résumé compétences par certification (repris des objectifs de formation)
export const OBJECTIFS: Record<string, string> = {
  NIV1: "Réaliser des pizzas classiques, de l'élaboration de l'empâtement direct jusqu'à la sortie du four.",
  NIV1PRO: "Mettre en pratique le protocole d'empâtement ainsi que l'étalage à la main.",
  NIV2: "Réaliser des empâtements indirects « Poolish – Biga – Contemporaine ».",
  RS7404: "Fabriquer des pizzas artisanales, de l'empâtement direct ou semi-direct jusqu'à la présentation du produit fini.",
  TEGLIA: "Réaliser une pizza In Teglia & In Pala, spécialités italiennes vendues à la part.",
  EXPERT: "Maîtriser Poolish, Biga, Contemporaine, In Teglia & In Pala.",
  NAPO: "Réaliser des pizzas napolitaines, de l'empâtement à la cuisson.",
};

export const ressourcesFor = (code: string): ModuleRessource[] => RESSOURCES[code] ?? [];
export const nbLecons = (code: string) =>
  ressourcesFor(code).reduce((n, m) => n + m.lecons.length, 0);
