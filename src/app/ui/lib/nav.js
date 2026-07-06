/**
 * Navigation latérale — groupée par domaine, avec les rôles autorisés par page.
 * (Ne liste que les pages implémentées dans cette fondation.)
 */
export const NAV = [
  {
    grp: "Pilotage",
    items: [
      { to: "/dashboard", ic: "◧", label: "Tableau de bord", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"] },
    ],
  },
  {
    grp: "Secrétariat",
    items: [
      { to: "/stagiaires", ic: "☺", label: "Stagiaires", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"] },
      { to: "/sessions", ic: "▦", label: "Sessions", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"] },
      { to: "/suivi", ic: "▤", label: "Suivi Qualiopi", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"] },
    ],
  },
  {
    grp: "Développement",
    items: [
      { to: "/formations", ic: "◍", label: "Formations", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"] },
      { to: "/partenaires", ic: "🤝", label: "Partenaires", roles: ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"] },
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
};

/** Un rôle peut-il accéder à cette page ? */
export function canAccess(role, roles) {
  return !roles || (role && roles.includes(role));
}
