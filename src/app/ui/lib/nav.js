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
    grp: "Secrétariat",
    items: [
      { to: "/stagiaires", ic: "☺", label: "Stagiaires", roles: STAFF },
      { to: "/pipeline", ic: "▚", label: "Pipeline CRM", roles: ADMIN },
      { to: "/sessions", ic: "▦", label: "Sessions", roles: STAFF },
      { to: "/suivi", ic: "▤", label: "Suivi Qualiopi", roles: AUDIT },
    ],
  },
  {
    grp: "Développement",
    items: [
      { to: "/formations", ic: "◍", label: "Formations", roles: STAFF },
      { to: "/qcm", ic: "❓", label: "QCM & tests", roles: ADMIN },
      { to: "/produit-divers", ic: "💶", label: "Produit divers", roles: ["FORMATEUR"] },
      { to: "/carte", ic: "🗺", label: "Carte des stagiaires", roles: ADMIN },
      { to: "/partenaires", ic: "🤝", label: "Partenaires", roles: STAFF },
      { to: "/ventes", ic: "🛒", label: "Ventes & Inventaire", roles: ADMIN },
      { to: "/factures", ic: "🧾", label: "Facturation", roles: ADMIN },
      { to: "/comptabilite", ic: "€", label: "Comptabilité", roles: ADMIN },
    ],
  },
  {
    grp: "Système",
    items: [
      { to: "/reglages", ic: "⚙", label: "Organisme", roles: ADMIN },
      { to: "/equipe", ic: "👥", label: "Équipe & accès", roles: OWNER },
      { to: "/modeles", ic: "⎙", label: "Modèles de documents", roles: ADMIN },
      { to: "/audit", ic: "🔒", label: "Journal d'audit", roles: AUDIT },
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
  "/qcm": "QCM & tests",
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
