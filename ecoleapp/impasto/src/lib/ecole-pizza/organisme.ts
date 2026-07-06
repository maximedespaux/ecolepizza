// Identité officielle de l'organisme — vérifiée sur ecole-pizza.com et dans les
// pieds de page des templates Word (NDA, NAF). Sert à pré-remplir l'Organization
// en base au premier démarrage (seed) et de repère pour la génération documentaire.

export const ECOLE_PIZZA = {
  raisonSociale: "ECOLE PIZZAIOLO Jean-Jacques DESPAUX",
  sigle: "École Pizza",
  responsable: "Jean-Jacques DESPAUX",
  siret: "879 955 136 00012",
  nda: "76 65 00989 65", // déclaration d'activité auprès du préfet de région Occitanie
  nafApe: "8559A",
  adresse: "101 rue Alsace Lorraine",
  codePostal: "65300",
  ville: "Lannemezan",
  telephone: "05 62 50 18 64",
  portable: "06 84 54 24 96",
  email: "contact@ecole-pizza.com",
  qualiopi: true, // certifié depuis 2021 (accréditation Cofrac)
  juridiction: "Tarbes",
  horairesType:
    "Lundi 8h45–12h00 & 13h00–17h15 · jours suivants 8h00–12h00 & 13h00–16h30",
} as const;

export type Organisme = typeof ECOLE_PIZZA;
