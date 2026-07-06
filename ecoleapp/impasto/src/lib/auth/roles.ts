// Rôles & permissions (point « Rôle » du cahier des charges).
// Administration : Secrétariat (Admin), Formateur (Co-Admin).
// Étudiants : accès limité aux fichiers de leur niveau/spécialisation.

export type Role =
  | "SUPER_ADMIN" | "ADMIN_ORGANISME" | "SECRETARIAT" | "FORMATEUR"
  | "STAGIAIRE" | "ENTREPRISE" | "FINANCEUR" | "AUDITEUR";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN_ORGANISME: "Administrateur",
  SECRETARIAT: "Secrétariat",
  FORMATEUR: "Formateur",
  STAGIAIRE: "Stagiaire",
  ENTREPRISE: "Entreprise",
  FINANCEUR: "Financeur",
  AUDITEUR: "Auditeur",
};

// Accès aux pages par rôle (navigation conditionnelle).
export const NAV_ACCESS: Record<string, Role[]> = {
  dashboard: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  stagiaires: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  calendrier: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  sessions: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  documents: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"],
  suivi: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"],
  formations: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  partenaires: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  carte: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  ventes: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"],
  reglages: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"],
  audit: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"],
  // Espace personnel du stagiaire (les admins peuvent le prévisualiser).
  "mon-espace": ["STAGIAIRE", "SUPER_ADMIN", "ADMIN_ORGANISME"],
};

export function canAccess(role: Role, page: string): boolean {
  return NAV_ACCESS[page]?.includes(role) ?? false;
}

// Page d'accueil par défaut selon le rôle (après connexion / si accès refusé).
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/dashboard",
  ADMIN_ORGANISME: "/dashboard",
  SECRETARIAT: "/dashboard",
  FORMATEUR: "/dashboard",
  STAGIAIRE: "/mon-espace",
  ENTREPRISE: "/suivi",
  FINANCEUR: "/suivi",
  AUDITEUR: "/suivi",
};
export const homeFor = (role: Role) => ROLE_HOME[role] ?? "/dashboard";

// Niveaux / spécialisations donnant accès aux ressources pédagogiques (extranet).
export const NIVEAUX_ETUDIANT = [
  { code: "NIV1", label: "Niveau I" },
  { code: "RS7404", label: "RS — Fabriquer des pizzas artisanales" },
  { code: "NIV1PRO", label: "Niveau I Pro" },
  { code: "NIV2", label: "Niveau II" },
  { code: "EXPERT", label: "Niveau Expert" },
  { code: "NAPO", label: "Spécialisation Napolitaine" },
  { code: "TEGLIA", label: "Spécialisation Teglia & Pala" },
] as const;
