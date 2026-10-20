// Catégories de dépense et sources de chiffre d'affaires — partagées par la Comptabilité et l'écran
// Facturation (gestion par entité, migration 212). Mêmes clés que src/api/lib/compta.js : l'écran
// n'envoie que des clés, le serveur les valide.

export const CATS = [
  { v: "MATIERES_PREMIERES", label: "Matières premières" },
  { v: "SALAIRES", label: "Salaires & charges" },
  { v: "LOYER", label: "Loyer & locaux" },
  { v: "MARKETING", label: "Marketing & envois" },
  { v: "ENERGIE", label: "Énergie" },
  { v: "DIVERS", label: "Divers" },
];

// Les trois sources de CA d'une entité. `k` = la clé côté Comptabilité (data.streams, data.ca —
// « extra » pour les produits divers) ; `champ` = la colonne billing_profile envoyée au serveur.
export const CA_SOURCES = [
  { k: "inscriptions", caKey: "inscriptions", champ: "revenue_inscriptions", label: "Inscriptions (formations)" },
  { k: "materiel", caKey: "materiel", champ: "revenue_materiel", label: "Ventes de matériel" },
  { k: "divers", caKey: "extra", champ: "revenue_divers", label: "Produits divers" },
];
