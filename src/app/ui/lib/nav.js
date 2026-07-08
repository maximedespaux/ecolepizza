/**
 * Navigation latérale — groupée par domaine, avec les rôles autorisés par page.
 *
 * Trois niveaux d'accès internes :
 *  · ADMIN     — bureau (super admin, admin organisme, secrétariat) : accès complet.
 *  · FORMATEUR — accès pédagogique restreint (sessions/émargement, formations,
 *                consultation des stagiaires, saisie d'un produit divers).
 *  · AUDITEUR  — consultation (suivi Qualiopi, journal d'audit).
 */
const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];
const STAFF = [...ADMIN, "FORMATEUR"];        // bureau + formateur (lecture pédagogique)
const AUDIT = [...ADMIN, "AUDITEUR"];         // bureau + auditeur
const OWNER = ["SUPER_ADMIN", "ADMIN_ORGANISME"]; // propriétaire + admins (gestion des accès)

export const NAV = [
  {
    grp: "Pilotage",
    items: [
      { to: "/dashboard", ic: "◧", label: "Tableau de bord", roles: STAFF },
    ],
  },
  {
    grp: "Formation",            // cœur pédagogique : qui, quand, quoi
    items: [
      { to: "/stagiaires", ic: "☺", label: "Stagiaires", roles: STAFF },
      { to: "/sessions", ic: "▦", label: "Sessions", roles: STAFF },
      { to: "/formations", ic: "◍", label: "Formations", roles: STAFF },
    ],
  },
  {
    grp: "Commercial",           // acquisition & relations
    items: [
      { to: "/pipeline", ic: "▚", label: "Pipeline CRM", roles: ADMIN },
      { to: "/partenaires", ic: "🤝", label: "Partenaires", roles: STAFF },
      { to: "/carte", ic: "🗺", label: "Carte des stagiaires", roles: ADMIN },
    ],
  },
  {
    grp: "Ventes & Finance",     // encaissement, stock, compta
    items: [
      { to: "/ventes", ic: "🛒", label: "Ventes & Inventaire", roles: ADMIN },
      { to: "/produit-divers", ic: "💶", label: "Produit divers", roles: ["FORMATEUR"] },
      { to: "/factures", ic: "🧾", label: "Facturation", roles: ADMIN },
      { to: "/comptabilite", ic: "€", label: "Comptabilité", roles: ADMIN },
    ],
  },
  {
    grp: "Qualité & conformité", // Qualiopi + traçabilité
    items: [
      { to: "/suivi", ic: "▤", label: "Suivi Qualiopi", roles: AUDIT },
      { to: "/audit", ic: "🔒", label: "Journal d'audit", roles: AUDIT },
    ],
  },
  {
    grp: "Configuration",        // paramétrage de l'organisme & modèles
    items: [
      { to: "/reglages", ic: "⚙", label: "Organisme", roles: ADMIN },
      { to: "/equipe", ic: "👥", label: "Équipe & accès", roles: OWNER },
      { to: "/modeles", ic: "⎙", label: "Modèles de documents", roles: ADMIN },
      { to: "/qcm", ic: "❓", label: "Modèles de QCM", roles: ADMIN },
    ],
  },
];

/** Libellé de page (fil d'Ariane). */
export const PAGE_TITLES = {
  "/dashboard": "Tableau de bord",
  "/stagiaires": "Stagiaires",
  "/pipeline": "Pipeline CRM",
  "/sessions": "Sessions",
  "/suivi": "Suivi Qualiopi",
  "/formations": "Formations",
  "/qcm": "Modèles de QCM",
  "/produit-divers": "Produit divers",
  "/carte": "Carte des stagiaires",
  "/partenaires": "Partenaires",
  "/inventaire": "Inventaire",
  "/ventes": "Ventes de Matériels et Inventaire",
  "/factures": "Facturation",
  "/comptabilite": "Comptabilité",
  "/reglages": "Organisme",
  "/equipe": "Équipe & accès",
  "/modeles": "Modèles de documents",
  "/audit": "Journal d'audit",
  "/notifications": "Notifications",
};

/** Un rôle peut-il accéder à cette page ? */
export function canAccess(role, roles) {
  return !roles || (role && roles.includes(role));
}

// Rôles propriétaires : toujours accès complet à leur menu (jamais restreints par
// la configuration d'accès menu ; ce sont eux qui la définissent).
export const OWNER_ROLES = ["SUPER_ADMIN", "ADMIN_ORGANISME"];

/** L'utilisateur a-t-il ce chemin dans sa liste d'accès menu ? (non-propriétaires) */
export function navAllowed(user, path) {
  const allow = Array.isArray(user?.nav_access) ? user.nav_access : [];
  return allow.includes(path);
}

/**
 * L'utilisateur peut-il voir/ouvrir cet item de menu ?
 *  · propriétaires (SUPER_ADMIN / ADMIN_ORGANISME) : selon leur rôle ;
 *  · autres : uniquement les chemins explicitement accordés (rien tant que non accordé).
 */
export function canOpen(user, item) {
  if (!user) return false;
  if (OWNER_ROLES.includes(user.role)) return canAccess(user.role, item.roles);
  return navAllowed(user, item.to);
}

/** Page d'atterrissage : dashboard pour un propriétaire, 1er accès accordé sinon. */
export function landingPath(user) {
  if (!user) return "/login";
  if (OWNER_ROLES.includes(user.role)) return "/dashboard";
  for (const g of NAV) for (const it of g.items) if (navAllowed(user, it.to)) return it.to;
  return "/aucun-acces";
}

// Items de menu que le super administrateur peut accorder (tout sauf la gestion
// d'équipe, réservée aux propriétaires).
export const GRANTABLE_NAV = NAV
  .map((g) => ({ grp: g.grp, items: g.items.filter((it) => it.to !== "/equipe") }))
  .filter((g) => g.items.length > 0);
