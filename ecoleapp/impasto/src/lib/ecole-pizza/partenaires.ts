// Partenaires commerciaux de l'École Pizza (dossier CONTRAT_PARTENAIRES).
// Données B2B (marques) — sert au seed de l'annuaire Partenaires.

export type PartnerCat =
  | "FARINE" | "MATERIEL" | "FOUR" | "CHARCUTERIE" | "FROMAGE"
  | "CONSERVE" | "DISTRIBUTION" | "AUTRE";

export interface PartenaireSeed {
  nom: string;
  categorie: PartnerCat;
}

export const PARTENAIRES: PartenaireSeed[] = [
  { nom: "5 Stagioni", categorie: "FARINE" },
  { nom: "Marana", categorie: "FARINE" },
  { nom: "Demetra", categorie: "CONSERVE" },
  { nom: "Mutti", categorie: "CONSERVE" },
  { nom: "Galbani", categorie: "FROMAGE" },
  { nom: "Rovagnati", categorie: "CHARCUTERIE" },
  { nom: "Noir de Bigorre", categorie: "CHARCUTERIE" },
  { nom: "Ephrem", categorie: "AUTRE" },
  { nom: "Moretti Forni", categorie: "FOUR" },
  { nom: "Zanolli", categorie: "FOUR" },
  { nom: "Ooni", categorie: "FOUR" },
  { nom: "Gi Metal", categorie: "MATERIEL" },
  { nom: "Robot Coupe", categorie: "MATERIEL" },
  { nom: "Berkel", categorie: "MATERIEL" },
  { nom: "Gilac", categorie: "MATERIEL" },
  { nom: "Adial", categorie: "MATERIEL" },
  { nom: "Carmat", categorie: "MATERIEL" },
  { nom: "Kokko", categorie: "MATERIEL" },
  { nom: "Eligo Pro", categorie: "DISTRIBUTION" },
  { nom: "GPA", categorie: "DISTRIBUTION" },
  { nom: "Groupe Lefebvre", categorie: "DISTRIBUTION" },
  { nom: "Metro", categorie: "DISTRIBUTION" },
  { nom: "Desther", categorie: "AUTRE" },
];

export const PARTNER_CATEGORIES: { value: PartnerCat; label: string }[] = [
  { value: "FARINE", label: "Farine" },
  { value: "MATERIEL", label: "Matériel" },
  { value: "FOUR", label: "Four" },
  { value: "CHARCUTERIE", label: "Charcuterie" },
  { value: "FROMAGE", label: "Fromage" },
  { value: "CONSERVE", label: "Conserve / tomate" },
  { value: "DISTRIBUTION", label: "Distribution" },
  { value: "AUTRE", label: "Autre" },
];
