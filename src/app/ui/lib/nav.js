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
      { to: "/dashboard", ic: "dashboard", label: "Tableau de bord", roles: STAFF },
    ],
  },
  {
    grp: "Formation",            // cœur pédagogique : qui, quand, quoi
    items: [
      { to: "/stagiaires", ic: "users", label: "Stagiaires", roles: STAFF },
      { to: "/entreprises", ic: "building", label: "Entreprises", roles: ADMIN },
      { to: "/sessions", ic: "calendar", label: "Sessions", roles: STAFF },
      { to: "/formations", ic: "graduation", label: "Formations", roles: STAFF },
    ],
  },
  {
    grp: "Commercial",           // acquisition & relations
    items: [
      { to: "/pipeline", ic: "columns", label: "Pipeline CRM", roles: ADMIN },
      { to: "/partenaires", ic: "handshake", label: "Partenaires", roles: STAFF },
      { to: "/carte", ic: "map", label: "Carte des stagiaires", roles: ADMIN },
    ],
  },
  {
    grp: "Ventes & Finance",     // encaissement, stock, compta
    items: [
      { to: "/ventes", ic: "cart", label: "Ventes & Inventaire", roles: ADMIN },
      { to: "/demandes-boutique", ic: "package", label: "Demandes boutique", roles: ADMIN },
      { to: "/produit-divers", ic: "coins", label: "Produit divers", roles: ["FORMATEUR"] },
      { to: "/factures", ic: "receipt", label: "Facturation", roles: ADMIN },
      { to: "/comptabilite", ic: "calculator", label: "Comptabilité", roles: ADMIN },
    ],
  },
  {
    grp: "Qualité & conformité", // Qualiopi + traçabilité
    items: [
      { to: "/suivi", ic: "clipboard-check", label: "Suivi Qualiopi", roles: AUDIT },
      { to: "/audit", ic: "history", label: "Journal d'audit", roles: AUDIT },
    ],
  },
  {
    grp: "Configuration",        // paramétrage de l'organisme & modèles
    items: [
      { to: "/reglages", ic: "building", label: "Organisme", roles: ADMIN },
      { to: "/equipe", ic: "team", label: "Équipe & accès", roles: OWNER },
      { to: "/roles", ic: "shield", label: "Rôles d'accès", roles: OWNER },
      { to: "/modeles", ic: "file-text", label: "Modèles de documents", roles: ADMIN },
      { to: "/qcm", ic: "list-checks", label: "Modèles de QCM", roles: ADMIN },
      { to: "/opcos", ic: "landmark", label: "OPCO / financeurs", roles: ADMIN },
    ],
  },
];

/** Libellé de page (fil d'Ariane). */
export const PAGE_TITLES = {
  "/dashboard": "Tableau de bord",
  "/stagiaires": "Stagiaires",
  "/entreprises": "Entreprises",
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
  "/demandes-boutique": "Demandes boutique",
  "/factures": "Facturation",
  "/comptabilite": "Comptabilité",
  "/reglages": "Organisme",
  "/equipe": "Équipe & accès",
  "/roles": "Rôles d'accès",
  "/modeles": "Modèles de documents",
  "/opcos": "OPCO / financeurs",
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

// Rubriques déplacées dans le hub « Paramètres » (menu profil) et retirées de la barre latérale.
export const SETTINGS_PATHS = ["/reglages", "/equipe", "/roles"];

// Normalise nav_access en objet { chemin: "read" | "write" }.
// Rétro-compat : un tableau (ancien format) = tout en écriture.
// Accès NON configuré (null/undefined) : on retombe sur les accès PAR DÉFAUT du rôle
// (sinon un compte fraîchement créé, ex. Formateur, n'aurait accès à rien).
function navMap(user) {
  let na = user?.nav_access;
  if (na == null) return builtinRoleAccess(user?.role);
  // Sécurité : si l'API renvoie encore le JSON en chaîne, on le désérialise.
  if (typeof na === "string") { try { na = JSON.parse(na); } catch { return {}; } }
  if (Array.isArray(na)) { const o = {}; na.forEach((p) => { o[p] = "write"; }); return o; }
  return typeof na === "object" && na ? na : {};
}

/** L'utilisateur a-t-il ce chemin dans sa liste d'accès menu ? (non-propriétaires) */
export function navAllowed(user, path) {
  return Object.prototype.hasOwnProperty.call(navMap(user), path);
}

/**
 * Mode d'accès de l'utilisateur pour ce chemin :
 *  · "write" (modification) / "read" (lecture seule) / null (non accordé).
 * Les propriétaires sont toujours en écriture.
 */
export function navMode(user, path) {
  if (OWNER_ROLES.includes(user?.role)) return "write";
  const v = navMap(user)[path];
  return v === "read" ? "read" : (v ? "write" : null);
}

// Chemin de navigation (rubrique) correspondant à un chemin de route.
// Les sous-pages (détails) partagent la rubrique parente.
const SECTION_OF = {
  "/stagiaires": "/stagiaires", "/entreprises": "/entreprises", "/sessions": "/sessions", "/formations": "/formations",
  "/pipeline": "/pipeline", "/qcm": "/qcm", "/partenaires": "/partenaires",
  "/ventes": "/ventes", "/inventaire": "/ventes", "/factures": "/factures",
  "/comptabilite": "/comptabilite", "/produit-divers": "/produit-divers", "/carte": "/carte",
  "/reglages": "/reglages", "/modeles": "/modeles", "/equipe": "/equipe",
  "/audit": "/audit", "/suivi": "/suivi", "/dashboard": "/dashboard",
};

/** Mode d'accès pour l'URL courante (rubrique déduite du 1er segment). */
export function modeForPath(user, pathname) {
  const seg = "/" + (pathname || "").split("/").filter(Boolean)[0];
  const section = SECTION_OF[seg] || seg;
  return navMode(user, section);
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

// Accès « supplémentaires » : des capacités transverses (pas des pages) qu'on
// accorde par rôle ou par membre, stockées dans nav_access comme une page. La
// présence de la clé = capacité accordée (le mode read/write ne s'applique pas).
// `defaultRoles` = rôles qui l'ont d'office (case cochée et verrouillée).
export const EXTRA_ACCESS = [
  {
    to: "cap:reveal-money",
    label: "Révéler les montants",
    hint: "Pages Ventes & Finance — lève le masque des montants (• • • • •).",
    ic: "eye",
    defaultRoles: ["SUPER_ADMIN"],
  },
];

// Rôles « système » (intégrés) : servent de modèles d'accès réutilisables.
export const BUILTIN_ROLES = [
  { role: "SUPER_ADMIN", name: "Super administrateur", color: "#c0392b" },
  { role: "ADMIN_ORGANISME", name: "Administrateur", color: "#2c3371" },
  { role: "SECRETARIAT", name: "Secrétariat", color: "#2e9e5b" },
  { role: "FORMATEUR", name: "Formateur", color: "#e0932e" },
  { role: "AUDITEUR", name: "Auditeur", color: "#7b3f9e" },
];

// Palette de couleurs proposée pour les rôles personnalisés.
export const ROLE_COLORS = ["#c0392b", "#e0932e", "#b8860b", "#2e9e5b", "#2f9e6f", "#2c3371", "#3a4291", "#7b3f9e", "#8a5a2b", "#555b6e"];

// Accès menu par défaut d'un rôle système (toutes les pages qu'il peut ouvrir, en écriture).
export function builtinRoleAccess(roleCode) {
  const o = {};
  for (const g of GRANTABLE_NAV) for (const it of g.items) if (canAccess(roleCode, it.roles)) o[it.to] = "write";
  return o;
}
