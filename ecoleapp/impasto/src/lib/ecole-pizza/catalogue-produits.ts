// ============================================================================
// Base PRODUITS PARTENAIRES — École Pizza
// ----------------------------------------------------------------------------
// Recherche réelle (sources citées en fin de fichier). Les CARACTÉRISTIQUES
// (type, force W, matière grasse, conditionnement, agrément AVPN…) sont
// vérifiées d'après les fiches fournisseurs. Les PRIX sont volontairement
// laissés à `null` : ils dépendent du contrat négocié avec chaque partenaire
// et doivent être saisis/confirmés dans l'app (champ `prixHT`). On n'invente
// aucun tarif.
//
// Convention `parStagiaire` : quantité de marchandise reversée par stagiaire,
// utilisée UNIQUEMENT pour le récapitulatif annuel (comptabilisation), jamais
// affichée sur le bon de commande. `null` = matériel/non consommable.
// ============================================================================

export type Categorie =
  | "Farines" | "Fromages" | "Tomates" | "Charcuterie"
  | "Épicerie" | "Levures" | "Huiles" | "Matériel" | "Combustible";

export interface FournisseurSeed {
  id: string;
  nom: string;
  categoriePrincipale: string;
  partenaire: boolean;
  canal?: string;          // par qui on commande (Metro, GPA, Lactalis Foodservice…)
  delaiJours?: number;     // délai moyen indicatif — à confirmer
  minCommandeEuro?: number | null;
  site?: string;
}

export interface ProduitSeed {
  id: string;
  nom: string;
  marque: string;
  fournisseurId: string;
  categorie: Categorie;
  conditionnement: string;         // ex. "sac 25 kg", "bac 2,5 kg"
  unite: string;                   // unité de suivi de stock
  caracteristiques?: string;       // specs vérifiées
  usages?: string[];               // codes formations concernées
  partenaire: boolean;
  recommande?: boolean;            // produit à privilégier
  prixHT: number | null;           // à confirmer (contrat)
  parStagiaire?: number | null;    // pour récap annuel — jamais sur le BC
  source?: string;
}

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------
export const FOURNISSEURS: FournisseurSeed[] = [
  { id: "5stagioni", nom: "Le 5 Stagioni (Agugiaro & Figna)", categoriePrincipale: "Farines", partenaire: true, canal: "GPA / Metro", delaiJours: 5, minCommandeEuro: null, site: "https://www.5stagioni.it" },
  { id: "galbani",   nom: "Galbani Professionale (Lactalis Foodservice)", categoriePrincipale: "Fromages", partenaire: true, canal: "Lactalis Foodservice / Metro", delaiJours: 4, minCommandeEuro: null, site: "https://www.galbani-professionale.fr" },
  { id: "mutti",     nom: "Mutti Foodservice", categoriePrincipale: "Tomates", partenaire: true, canal: "GPA / Metro", delaiJours: 6, minCommandeEuro: null, site: "https://www.mutti-parma.com" },
  { id: "rovagnati", nom: "Rovagnati", categoriePrincipale: "Charcuterie", partenaire: true, canal: "GPA", delaiJours: 5, minCommandeEuro: null },
  { id: "demetra",   nom: "Demetra Food", categoriePrincipale: "Épicerie", partenaire: true, canal: "GPA / Non Solo Buono", delaiJours: 7, minCommandeEuro: null },
  { id: "ndb",       nom: "Consortium du Noir de Bigorre", categoriePrincipale: "Charcuterie", partenaire: true, canal: "Direct (local 65)", delaiJours: 4, minCommandeEuro: null },
  { id: "gimetal",   nom: "Gi.Metal", categoriePrincipale: "Matériel", partenaire: true, canal: "Direct / revendeur", delaiJours: 10, minCommandeEuro: null, site: "https://www.gimetal.it" },
  { id: "moretti",   nom: "Moretti Forni", categoriePrincipale: "Matériel", partenaire: true, canal: "Direct", delaiJours: 14, minCommandeEuro: null },
  { id: "metro",     nom: "Metro", categoriePrincipale: "Généraliste", partenaire: false, canal: "Metro", delaiJours: 2, minCommandeEuro: null },
  { id: "gpa",       nom: "GPA (grossiste italien)", categoriePrincipale: "Généraliste", partenaire: false, canal: "GPA", delaiJours: 3, minCommandeEuro: null, site: "https://www.g-p-a.fr" },
];

// ---------------------------------------------------------------------------
// Produits — FARINES Le 5 Stagioni (gamme réelle, specs vérifiées)
// ---------------------------------------------------------------------------
export const PRODUITS: ProduitSeed[] = [
  {
    id: "far-napoletana",
    nom: "Farine Pizza Napoletana Type 00 (W ~300–310)",
    marque: "Le 5 Stagioni", fournisseurId: "5stagioni", categorie: "Farines",
    conditionnement: "sac 25 kg", unite: "kg",
    caracteristiques: "Type 00, protéines ≥13%, absorption ≥55%, agréée AVPN (Associazione Verace Pizza Napoletana). Maturation moyenne à longue.",
    usages: ["NAPO", "RS7404", "NIV1"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 2,
    source: "epiceriemagique.fr / mozzalat.fr",
  },
  {
    id: "far-superiore",
    nom: "Farine Superiore Type 00 (W ~330)",
    marque: "Le 5 Stagioni", fournisseurId: "5stagioni", categorie: "Farines",
    conditionnement: "sac 25 kg", unite: "kg",
    caracteristiques: "Type 00, farine de force, protéines ≥14%, absorption ≥60%. Idéale protocoles indirects Biga & Poolish et hautes hydratations.",
    usages: ["NIV2", "NIV2C", "EXPERT"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 2,
    source: "bienmanger.com / pizzavore.fr",
  },
  {
    id: "far-rinforzato",
    nom: "Farine Rinforzato Type 00",
    marque: "Le 5 Stagioni", fournisseurId: "5stagioni", categorie: "Farines",
    conditionnement: "sac 25 kg", unite: "kg",
    caracteristiques: "Type 00, protocoles courts (2–6 h T° ambiante). Adaptée à la pizza in teglia / à la coupe.",
    usages: ["TEGLIA", "NIV1PRO"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 2,
    source: "pizzavore.fr",
  },
  {
    id: "far-manitoba",
    nom: "Farine Manitoba Type 00 (force élevée)",
    marque: "Le 5 Stagioni", fournisseurId: "5stagioni", categorie: "Farines",
    conditionnement: "sac 25 kg", unite: "kg",
    caracteristiques: "Type 00 très riche en protéines. Protocoles très longs ; sert aussi à renforcer des farines plus faibles.",
    usages: ["EXPERT", "NIV2C"], partenaire: true, recommande: false,
    prixHT: null, parStagiaire: 0.5,
    source: "pizzavore.fr",
  },

  // -------------------------------------------------------------------------
  // FROMAGES Galbani Professionale (gamme réelle, specs vérifiées)
  // -------------------------------------------------------------------------
  {
    id: "moz-fiordilatte",
    nom: "Mozzarella Fiordilatte (gros brin)",
    marque: "Galbani Professionale", fournisseurId: "galbani", categorie: "Fromages",
    conditionnement: "bac 2,5 kg", unite: "kg",
    caracteristiques: "Lait 100% italien. Gros brin, fonte lente, fort pouvoir couvrant et filant, reste blanche à haute température — recommandée napolitaine/contemporaine.",
    usages: ["NAPO", "RS7404", "NIV1", "NIV1H"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 1.2,
    source: "lactalisfoodservice.fr / snacking.fr",
  },
  {
    id: "moz-julienne",
    nom: "Mozzarella Fiordilatte Julienne (4×8×30 mm)",
    marque: "Galbani Professionale", fournisseurId: "galbani", categorie: "Fromages",
    conditionnement: "sac 2,5 kg (aussi 1,5 kg)", unite: "kg",
    caracteristiques: "Coupe julienne, 48% MG sur sec, fusion rapide, bonne couverture, résiste aux hautes T°. Prête à l'emploi.",
    usages: ["NIV1", "NIV1PRO", "NIV2", "TEGLIA"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 1,
    source: "lactalisprofessional.ch",
  },
  {
    id: "moz-bufala",
    nom: "Mozzarella di Bufala",
    marque: "Galbani Professionale", fournisseurId: "galbani", categorie: "Fromages",
    conditionnement: "à confirmer", unite: "kg",
    caracteristiques: "100% lait de bufflonne, texture crémeuse, goût typé (usage à froid ou en garniture premium).",
    usages: ["NAPO", "EXPERT"], partenaire: true, recommande: false,
    prixHT: null, parStagiaire: 0.3,
    source: "galbani-professionale.fr",
  },
  {
    id: "grana-rape",
    nom: "Grana Padano DOP râpé",
    marque: "Galbani Professionale", fournisseurId: "galbani", categorie: "Fromages",
    conditionnement: "à confirmer", unite: "kg",
    caracteristiques: "DOP, râpé, pour finition et garnitures.",
    usages: ["NIV1", "NAPO", "EXPERT"], partenaire: true, recommande: false,
    prixHT: null, parStagiaire: 0.15,
    source: "galbani-professionale.fr",
  },

  // -------------------------------------------------------------------------
  // TOMATES Mutti (références connues — formats à confirmer)
  // -------------------------------------------------------------------------
  {
    id: "tom-polpa",
    nom: "Polpa (pulpe de tomate)",
    marque: "Mutti", fournisseurId: "mutti", categorie: "Tomates",
    conditionnement: "boîte 2,5 kg (à confirmer)", unite: "boîte",
    caracteristiques: "Pulpe de tomate en dés — base sauce pizza. Gamme foodservice.",
    usages: ["NIV1", "NIV1H", "NIV1PRO", "NIV2", "NAPO", "TEGLIA", "RS7404"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 0.8,
    source: "mutti-parma.com (à confirmer)",
  },
  {
    id: "tom-pelati",
    nom: "Pelati (tomates pelées entières)",
    marque: "Mutti", fournisseurId: "mutti", categorie: "Tomates",
    conditionnement: "boîte 2,5 kg (à confirmer)", unite: "boîte",
    caracteristiques: "Tomates pelées entières — pour sauce mixée maison, style napolitain.",
    usages: ["NAPO", "RS7404"], partenaire: true, recommande: false,
    prixHT: null, parStagiaire: 0.4,
    source: "mutti-parma.com (à confirmer)",
  },

  // -------------------------------------------------------------------------
  // CHARCUTERIE / ÉPICERIE / LOCAL
  // -------------------------------------------------------------------------
  {
    id: "char-jambon",
    nom: "Jambon cuit italien",
    marque: "Rovagnati", fournisseurId: "rovagnati", categorie: "Charcuterie",
    conditionnement: "à confirmer", unite: "kg",
    caracteristiques: "Charcuterie italienne — garniture.",
    usages: ["NIV1", "NIV1PRO", "NIV2"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 0.3,
  },
  {
    id: "char-ndb",
    nom: "Jambon Noir de Bigorre (local 65)",
    marque: "Noir de Bigorre", fournisseurId: "ndb", categorie: "Charcuterie",
    conditionnement: "à confirmer", unite: "kg",
    caracteristiques: "Produit local des Hautes-Pyrénées — valorisation régionale sur les recettes signature.",
    usages: ["EXPERT", "NIV2C"], partenaire: true, recommande: false,
    prixHT: null, parStagiaire: 0.1,
  },
  {
    id: "huile-olive",
    nom: "Huile d'olive extra vierge",
    marque: "Demetra", fournisseurId: "demetra", categorie: "Huiles",
    conditionnement: "bidon 5 L", unite: "L",
    caracteristiques: "Huile d'olive pour empâtement et finition.",
    usages: ["NIV1", "NIV1H", "NIV1PRO", "NIV2", "NAPO", "TEGLIA", "RS7404"], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: 0.15,
  },

  // -------------------------------------------------------------------------
  // NON PARTENAIRES (déclenchent la suggestion "un partenaire équivaut")
  // -------------------------------------------------------------------------
  {
    id: "moz-generique",
    nom: "Mozzarella râpée générique",
    marque: "Sans marque", fournisseurId: "metro", categorie: "Fromages",
    conditionnement: "sac 2,5 kg", unite: "kg",
    caracteristiques: "Dépannage — un équivalent partenaire (Galbani Julienne) existe.",
    usages: [], partenaire: false, recommande: false,
    prixHT: null, parStagiaire: null,
  },
  {
    id: "levure-fraiche",
    nom: "Levure fraîche de boulanger",
    marque: "—", fournisseurId: "metro", categorie: "Levures",
    conditionnement: "—", unite: "kg",
    caracteristiques: "Levure fraîche — dosage selon protocole.",
    usages: ["NIV1", "NIV1H", "NIV1PRO", "NIV2", "NAPO", "TEGLIA", "RS7404"], partenaire: false, recommande: false,
    prixHT: null, parStagiaire: 0.05,
  },

  // -------------------------------------------------------------------------
  // MATÉRIEL (non consommable — parStagiaire null)
  // -------------------------------------------------------------------------
  {
    id: "mat-pelle",
    nom: "Pelle à enfourner perforée",
    marque: "Gi.Metal", fournisseurId: "gimetal", categorie: "Matériel",
    conditionnement: "pièce", unite: "pièce",
    caracteristiques: "Matériel professionnel — équipement d'atelier.",
    usages: [], partenaire: true, recommande: true,
    prixHT: null, parStagiaire: null,
  },
];

// Helpers
export const fournisseurById = (id: string) => FOURNISSEURS.find((f) => f.id === id);
export const produitsPartenaires = () => PRODUITS.filter((p) => p.partenaire);
export const produitsParCategorie = (c: Categorie) => PRODUITS.filter((p) => p.categorie === c);
// Suggestion partenaire pour un produit générique
export const equivalentPartenaire = (p: ProduitSeed) =>
  p.partenaire ? null : PRODUITS.find((x) => x.partenaire && x.categorie === p.categorie) ?? null;

// ============================================================================
// SOURCES (recherche du 05/07/2026) — à faire confirmer par tes contacts pro :
//  • Le 5 Stagioni (Napoletana W300-310 AVPN, Superiore W330, Rinforzato,
//    Manitoba) : epiceriemagique.fr, mozzalat.fr, bienmanger.com, pizzavore.fr,
//    g-p-a.fr (distributeur France).
//  • Galbani Professionale (Fiordilatte bac 2,5 kg gros brin ; Julienne
//    4x8x30 mm, 48% MG/sec ; di Bufala ; Grana Padano DOP) :
//    lactalisfoodservice.fr, lactalisprofessional.ch, snacking.fr.
//  • Mutti Polpa / Pelati : gamme foodservice — formats/prix à confirmer.
//  ⚠️ AUCUN PRIX n'est renseigné : à négocier/saisir par formation partenaire.
// ============================================================================
