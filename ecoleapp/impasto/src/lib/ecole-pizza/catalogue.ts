// Catalogue des formations — repris de la feuille « Programmes » du générateur Excel.
// Sert au seed de TrainingProgram et aux règles de génération documentaire.

export interface FormationSeed {
  code: string;
  titre: string;
  jours: number;
  heures: number;
  prix: number;
  public: string;
  objectifs: string;
  hygiene: boolean;
  rsCode?: string;
}

export const FORMATIONS: FormationSeed[] = [
  {
    code: "NIV1",
    titre: "Pizzaïolo Niveau I – Pizza Classique",
    jours: 5, heures: 35, prix: 1480,
    public: "Tout public, 16 ans minimum",
    objectifs: "Réaliser des pizzas classiques, de l'empâtement direct à la cuisson.",
    hygiene: false,
  },
  {
    code: "NIV1H",
    titre: "Niveau I – Pizza Classique & Hygiène alimentaire",
    jours: 5, heures: 44, prix: 1780,
    public: "Tout public, 16 ans minimum",
    objectifs: "Niveau I complété par l'hygiène alimentaire adaptée à l'activité.",
    hygiene: true,
  },
  {
    code: "NIV1PRO",
    titre: "Pizzaïolo Niveau I PRO – Pizza Classique",
    jours: 2, heures: 15, prix: 850,
    public: "Professionnel non initié aux bases théoriques",
    objectifs: "Mettre en pratique le protocole d'empâtement et l'étalage.",
    hygiene: false,
  },
  {
    code: "NIV2",
    titre: "Niveau II – Empâtements Indirects « Poolish - Biga »",
    jours: 2, heures: 15, prix: 850,
    public: "Avoir suivi le Niveau I (ou équivalent)",
    objectifs: "Réaliser des empâtements indirects « Poolish & Biga ».",
    hygiene: false,
  },
  {
    code: "NIV2C",
    titre: "Niveau II – Empâtements Indirects « Poolish - Biga - Contemporaine »",
    jours: 3, heures: 21, prix: 1180,
    public: "Avoir suivi le Niveau I (ou équivalent)",
    objectifs: "Empâtements indirects Poolish, Biga et pâte contemporaine.",
    hygiene: false,
  },
  {
    code: "EXPERT",
    titre: "Spécialisation « Expert »",
    jours: 4, heures: 32, prix: 1650,
    public: "Pizzaïolo confirmé",
    objectifs: "Poolish, Biga, Autolyse, Contemporaine, In Teglia & In Pala.",
    hygiene: false,
  },
  {
    code: "NAPO",
    titre: "Spécialisation Pizza Napolitaine",
    jours: 5, heures: 35, prix: 1750,
    public: "Tout public, 16 ans minimum",
    objectifs: "Réaliser des pizzas napolitaines, de l'empâtement à la cuisson.",
    hygiene: false,
  },
  {
    code: "TEGLIA",
    titre: "Spécialisation « In Teglia & In Pala »",
    jours: 2, heures: 14, prix: 850,
    public: "Tout public, 16 ans minimum",
    objectifs: "Réaliser des pizzas sur plaque vendues à la part.",
    hygiene: false,
  },
  {
    code: "RS7404",
    titre: "Fabriquer des pizzas artisanales (RS7404)",
    jours: 5, heures: 35, prix: 1750,
    public: "Professionnels des métiers de bouche",
    objectifs: "Certification RS7404 — fabriquer des pizzas artisanales.",
    hygiene: false,
    rsCode: "RS7404",
  },
];

export const formationByCode = (code: string) =>
  FORMATIONS.find((f) => f.code === code);
