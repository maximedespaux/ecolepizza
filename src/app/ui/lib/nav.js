/**
 * Navigation latérale — groupée par domaine, avec les rôles autorisés par page.
 *
 * Trois niveaux d'accès internes :
 *  · ADMIN     — bureau (super admin, admin organisme, secrétariat) : accès complet.
 *  · FORMATEUR — accès pédagogique restreint (sessions/émargement, formations,
 *                consultation des stagiaires, annuaire des partenaires).
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
      /* Le fil de la communauté, le MÊME que celui des stagiaires (l'API cadre sur
         l'organisme, pas sur le stagiaire). L'école y publiait déjà des annonces — la page
         prévoit `peutAnnoncer` pour le personnel — mais aucun chemin ne l'y menait : il fallait
         un compte stagiaire pour voir ce qu'on y disait, et pour y répondre.
         Rangé en « Formation » : c'est la vie du groupe pendant le stage, pas de la relation
         commerciale. Ouvert au formateur, qui est en salle avec eux. */
      { to: "/communaute", ic: "message-circle", label: "Communauté", roles: STAFF },
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
      { to: "/reglages-mailing", ic: "send", label: "Mailing", roles: ADMIN },
      { to: "/reglages-facturation", ic: "receipt", label: "Facturation", roles: ADMIN },
      /* CE QUI SORT DE L'ÉCOLE a sa propre rubrique : ce réglage ne décrit pas l'organisme comme
         son SIRET, il décide de ce qui est communiqué à des tiers — et le texte que les
         stagiaires acceptent en découle mot pour mot. */
      { to: "/reglages-partenaires", ic: "handshake", label: "Partenaires", roles: ADMIN },
      { to: "/equipe", ic: "team", label: "Équipe & accès", roles: OWNER },
      { to: "/roles", ic: "shield", label: "Rôles d'accès", roles: OWNER },
      { to: "/modeles", ic: "file-text", label: "Modèles de documents", roles: ADMIN },
      { to: "/qcm", ic: "list-checks", label: "Modèles de QCM", roles: ADMIN },
      { to: "/pizza-quest-admin", ic: "pizza", label: "Pizza Quest", roles: ADMIN },
      { to: "/opcos", ic: "landmark", label: "OPCO / financeurs", roles: ADMIN },
    ],
  },
];

/**
 * Le TON de chaque rubrique de la navigation.
 *
 * Trente pages qui se ressemblent toutes se confondent : au bout de trois clics, on ne sait
 * plus dans quelle partie de l'application on se trouve. Une couleur par DOMAINE — et non par
 * page — donne un repère qu'on lit sans le chercher, en gardant la charte : ce sont les
 * quatre couleurs de l'école, plus le navy de base.
 *
 * Le ton est attaché à la rubrique, jamais à l'écran : deux pages du même domaine se
 * ressemblent VOLONTAIREMENT, c'est ce qui fait qu'on les range ensemble.
 */
const TON_RUBRIQUE = {
  "Pilotage": "blue",
  "Formation": "orange",
  "Commercial": "gold",
  "Ventes & Finance": "green",
  "Qualité & conformité": "blue",
  "Configuration": "ember",
};

/**
 * La rubrique d'un chemin : son groupe, son icône, son ton.
 *
 * Cherche l'entrée de nav la PLUS LONGUE qui préfixe le chemin — sans quoi « /stagiaires/42 »
 * ne trouverait rien, et une fiche de détail perdrait la couleur de sa rubrique en plein
 * milieu du parcours.
 */
export function sectionDe(pathname) {
  let trouve = null;
  for (const g of NAV) {
    for (const it of g.items) {
      if ((pathname === it.to || pathname.startsWith(it.to + "/")) &&
          (!trouve || it.to.length > trouve.item.to.length)) {
        trouve = { grp: g.grp, item: it };
      }
    }
  }
  if (!trouve) return null;
  return { grp: trouve.grp, ic: trouve.item.ic, label: trouve.item.label, ton: TON_RUBRIQUE[trouve.grp] || "blue" };
}

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
  "/pizza-quest-admin": "Pizza Quest",
  "/carte": "Carte des stagiaires",
  "/partenaires": "Partenaires",
  "/communaute": "Communauté",
  "/inventaire": "Inventaire",
  "/ventes": "Ventes de Matériels et Inventaire",
  "/demandes-boutique": "Demandes boutique",
  "/factures": "Facturation",
  "/comptabilite": "Comptabilité",
  "/reglages": "Organisme",
  "/reglages-mailing": "Mailing",
  "/reglages-facturation": "Facturation",
  "/reglages-partenaires": "Partenaires",
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
export const SETTINGS_PATHS = ["/reglages", "/reglages-mailing", "/reglages-facturation", "/reglages-partenaires", "/equipe", "/roles"];

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
  "/communaute": "/communaute",
  "/pizza-quest-admin": "/pizza-quest-admin",
  "/ventes": "/ventes", "/inventaire": "/ventes", "/factures": "/factures",
  "/comptabilite": "/comptabilite", "/carte": "/carte",
  "/reglages": "/reglages", "/reglages-mailing": "/reglages-mailing", "/reglages-facturation": "/reglages-facturation", "/modeles": "/modeles", "/equipe": "/equipe",
  "/audit": "/audit", "/suivi": "/suivi", "/dashboard": "/dashboard",
};

/**
 * Regroupe les pastilles par RUBRIQUE de menu.
 *
 * Le serveur compte les pastilles par PAGE, ce qui est la bonne unité de sens : les articles
 * sous seuil concernent l'inventaire, pas « les ventes ». Mais toutes les pages n'ont pas leur
 * entrée de menu — `/inventaire` est une sous-page de `/ventes` — et la barre latérale ne sait
 * afficher une pastille que sur une entrée. Le compte des articles sous seuil était donc calculé
 * à chaque appel puis jeté, faute d'entrée pour le porter : la pastille n'est jamais apparue.
 *
 * On remonte donc chaque pastille sur sa rubrique, en SOMMANT — deux sous-pages d'une même
 * rubrique doivent additionner leurs alertes, pas s'écraser l'une l'autre. Un chemin absent de
 * `SECTION_OF` reste sur lui-même : les rubriques qui sont déjà leur propre page ne bougent pas.
 */
export function badgesParRubrique(badges) {
  const out = {};
  for (const [chemin, n] of Object.entries(badges || {})) {
    if (!n) continue;
    const rubrique = SECTION_OF[chemin] || chemin;
    out[rubrique] = (out[rubrique] || 0) + n;
  }
  return out;
}

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
    hint: "Pages Ventes & Finance, lève le masque des montants (• • • • •).",
    ic: "eye",
    defaultRoles: ["SUPER_ADMIN"],
  },
];

/**
 * Capacité attachée à UNE PAGE — elle se règle sur sa ligne, pas dans une liste à part.
 *
 * POURQUOI. « Lecture / Modifier » n'a aucun sens sur un FIL où tout le monde participe : la
 * Communauté n'a pas de version « consultation », et surtout, la question qui se pose vraiment
 * n'est pas celle-là. Quelqu'un du bureau qui publie sans pouvoir retirer un message est un
 * problème, pas un réglage. Ce qui varie, c'est ADMINISTRER ou non.
 *
 * La capacité vivait dans « Accès supplémentaires », tout en bas de la fenêtre, sans rapport
 * visible avec la ligne « Communauté » située plus haut : on pouvait accorder la page en
 * croyant avoir tout donné. Elle est maintenant sur la ligne même.
 *
 * `defaultRoles` = ceux qui l'ont d'office par leur rôle (case allumée et verrouillée). Sans
 * cela l'écran mentirait : `peutModerer` répond oui au bureau quoi qu'affiche la fenêtre.
 * La liste DOIT rester celle de `STAFF` dans lib/moderation.js — un test le vérifie.
 */
export const PAGE_CAPS = {
  "/communaute": {
    cap: "cap:moderate-community",
    label: "Administrer",
    hint: "Retirer ou corriger la publication, la réponse ou le commentaire d'un autre. Publier une annonce et épingler restent au bureau.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"],
  },
};

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
