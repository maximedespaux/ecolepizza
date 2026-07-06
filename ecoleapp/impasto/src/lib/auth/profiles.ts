// Profils de démonstration pour la « visualisation des rôles » (Phase 2).
// Pas d'authentification réelle : on incarne un profil pour voir l'app telle que
// chaque rôle la vit. La vraie connexion (next-auth) viendra plus tard.

import type { Role } from "./roles";
import { homeFor } from "./roles";

export interface Profile {
  id: string;
  role: Role;
  name: string;
  subtitle: string;
  initials: string;
  home: string;
  learnerId?: string; // lien vers un vrai stagiaire (espace personnel)
}

export const DEMO_PROFILES: Profile[] = [
  { id: "secretariat", role: "SECRETARIAT", name: "Maxime Despaux", subtitle: "Secrétariat · Admin", initials: "M", home: homeFor("SECRETARIAT") },
  { id: "formateur", role: "FORMATEUR", name: "Jean-Jacques Despaux", subtitle: "Formateur référent", initials: "JJ", home: homeFor("FORMATEUR") },
  { id: "stagiaire", role: "STAGIAIRE", name: "Élodie Joffre", subtitle: "Stagiaire · Pizzas artisanales", initials: "ÉJ", home: homeFor("STAGIAIRE") },
  { id: "auditeur", role: "AUDITEUR", name: "Audit Qualiopi", subtitle: "Auditeur externe", initials: "AQ", home: homeFor("AUDITEUR") },
];

export const profileById = (id: string | null | undefined): Profile | undefined =>
  DEMO_PROFILES.find((p) => p.id === id);
