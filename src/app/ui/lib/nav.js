/**
 * Navigation latérale — groupée par domaine, avec les rôles autorisés par page.
 */
const STAFF = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"];
const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];

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
      { to: "/sessions", ic: "▦", label: "Sessions", roles: STAFF },
      { to: "/suivi", ic: "▤", label: "Suivi Qualiopi", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"] },
    ],
  },
  {
    grp: "Développement",
    items: [
      { to: "/formations", ic: "◍", label: "Formations", roles: STAFF },
      { to: "/partenaires", ic: "🤝", label: "Partenaires", roles: STAFF },
      { to: "/inventaire", ic: "📦", label: "Inventaire", roles: STAFF },
      { to: "/ventes", ic: "🛒", label: "Ventes", roles: STAFF },
      { to: "/factures", ic: "🧾", label: "Facturation", roles: ADMIN },
    ],
  },
  {
    grp: "Système",
    items: [
      { to: "/reglages", ic: "⚙", label: "Organisme", roles: ADMIN },
      { to: "/audit", ic: "🔒", label: "Journal d'audit", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"] },
    ],
  },
];

/** Libellé de page (fil d'Ariane). */
export const PAGE_TITLES = {
  "/dashboard": "Tableau de bord",
  "/stagiaires": "Stagiaires",
  "/sessions": "Sessions",
  "/suivi": "Suivi Qualiopi",
  "/formations": "Formations",
  "/partenaires": "Partenaires",
  "/inventaire": "Inventaire",
  "/ventes": "Ventes de matériel",
  "/factures": "Facturation",
  "/reglages": "Organisme",
  "/audit": "Journal d'audit",
  "/notifications": "Notifications",
};

/** Un rôle peut-il accéder à cette page ? */
export function canAccess(role, roles) {
  return !roles || (role && roles.includes(role));
}
