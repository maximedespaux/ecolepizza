// Contenu pédagogique de l'espace stagiaire — modules par formation, prérequis
// (accès cumulatif) et plusieurs types d'activités ludiques (pas que des quiz).

export interface QuizQ { q: string; options: string[]; answer: number }
export interface VraiFaux { s: string; v: boolean }
export interface Ordre { titre: string; etapes: string[] } // dans le bon ordre
export interface Flashcard { terme: string; def: string }

export interface PedaModule {
  code: string; label: string; short: string; icon: string; manuel: string;
  topics: string[]; prereq: string[];
  quiz: QuizQ[]; vraiFaux: VraiFaux[]; ordre: Ordre; flashcards: Flashcard[];
}

export const MODULES: PedaModule[] = [
  {
    code: "NIV1", label: "Niveau I — Pizza Classique", short: "Les fondamentaux", icon: "🍕",
    manuel: "Manuel Technique Niveau I — Pizza classique",
    topics: ["Le pétrissage direct", "L'hydratation de la pâte", "Le façonnage des pâtons", "La cuisson au four", "Hygiène alimentaire (HACCP)"],
    prereq: [],
    quiz: [
      { q: "Quelle est l'hydratation classique d'une pâte napolitaine ?", options: ["45 %", "60 %", "85 %"], answer: 1 },
      { q: "Le sel doit être ajouté…", options: ["Avant la farine", "Jamais au contact direct de la levure", "Après cuisson"], answer: 1 },
      { q: "La fermentation lente au froid développe…", options: ["Moins de goût", "Les arômes et la digestibilité", "Une pâte plus dure"], answer: 1 },
      { q: "Le pâton, avant façonnage, doit être…", options: ["Bien détendu à température", "Sortant du froid glacé", "Sec en surface"], answer: 0 },
    ],
    vraiFaux: [
      { s: "On étale une pizza classique au rouleau.", v: false },
      { s: "La farine apporte le gluten qui donne l'élasticité.", v: true },
      { s: "Plus il y a de levure, meilleure est la pâte.", v: false },
      { s: "Le respect de la chaîne du froid fait partie de l'HACCP.", v: true },
    ],
    ordre: {
      titre: "Remets dans l'ordre les étapes d'une pizza classique",
      etapes: ["Pétrissage de la pâte", "Pointage (1re fermentation)", "Boulage des pâtons", "Apprêt (2e fermentation)", "Façonnage à la main", "Garnissage", "Cuisson au four"],
    },
    flashcards: [
      { terme: "Empâtement", def: "L'ensemble du processus de fabrication de la pâte." },
      { terme: "Pointage", def: "Première fermentation de la pâte, en masse." },
      { terme: "Apprêt", def: "Dernière fermentation, après le boulage des pâtons." },
      { terme: "HACCP", def: "Méthode de maîtrise de la sécurité sanitaire des aliments." },
    ],
  },
  {
    code: "NIV1PRO", label: "Niveau I Pro", short: "Le protocole professionnel", icon: "👨‍🍳",
    manuel: "Manuel Technique Niveau I Pro",
    topics: ["Protocole d'empâtement pro", "L'étalage sans rouleau", "Gestion du four professionnel", "La régularité en production"],
    prereq: [],
    quiz: [
      { q: "L'étalage professionnel se fait…", options: ["Au rouleau", "À la main, du centre vers les bords", "À la fourchette"], answer: 1 },
      { q: "Un bon protocole d'empâtement garantit…", options: ["La régularité", "Plus de déchets", "Une cuisson aléatoire"], answer: 0 },
      { q: "En production, on gère la pâte par…", options: ["Improvisation", "Timing des fermentations", "Hasard"], answer: 1 },
    ],
    vraiFaux: [
      { s: "La régularité est essentielle en production pro.", v: true },
      { s: "On peut garnir une pizza plusieurs heures avant cuisson.", v: false },
      { s: "Le bord (cornicione) se forme en laissant une marge sans garniture.", v: true },
    ],
    ordre: {
      titre: "Ordonne une journée de production",
      etapes: ["Préparation de l'empâtement", "Boulage et mise en bacs", "Fermentation contrôlée", "Étalage à la demande", "Garnissage minute", "Cuisson et envoi"],
    },
    flashcards: [
      { terme: "Cornicione", def: "Le bord gonflé et alvéolé de la pizza." },
      { terme: "Staffatura", def: "Le boulage : former des pâtons réguliers." },
      { terme: "Point de pâte", def: "État optimal de maturation avant utilisation." },
    ],
  },
  {
    code: "RS7404", label: "Fabriquer des pizzas artisanales", short: "Certification RS7404", icon: "🎓",
    manuel: "Manuel Technique — Fabriquer des pizzas artisanales",
    topics: ["Sélection des matières premières", "Empâtements artisanaux", "Garnitures & équilibres", "Démarche qualité", "Passage de la certification"],
    prereq: [],
    quiz: [
      { q: "Une pizza artisanale privilégie…", options: ["Des produits industriels", "Des matières premières de qualité", "La rapidité avant tout"], answer: 1 },
      { q: "La certification RS7404 valide…", options: ["Un diplôme d'État", "Une compétence inscrite au Répertoire Spécifique", "Un simple stage"], answer: 1 },
      { q: "L'équilibre d'une pizza repose sur…", options: ["La quantité de garniture", "Le rapport pâte / sauce / garniture", "Le prix"], answer: 1 },
    ],
    vraiFaux: [
      { s: "Le RS7404 est inscrit au Répertoire Spécifique de France Compétences.", v: true },
      { s: "Une bonne matière première compense un mauvais empâtement.", v: false },
      { s: "La traçabilité des produits fait partie de la démarche qualité.", v: true },
    ],
    ordre: {
      titre: "Le parcours qualité, de l'achat à l'assiette",
      etapes: ["Sélection des fournisseurs", "Réception et contrôle", "Stockage adapté", "Préparation", "Cuisson", "Contrôle final avant envoi"],
    },
    flashcards: [
      { terme: "RS7404", def: "Certification « Fabriquer des pizzas artisanales »." },
      { terme: "Traçabilité", def: "Suivre l'origine et le parcours d'un produit." },
      { terme: "DLC / DDM", def: "Dates limites : consommation / durabilité minimale." },
    ],
  },
  {
    code: "NAPO", label: "Spécialisation Napolitaine", short: "La vraie napolitaine", icon: "🌋",
    manuel: "Manuel — Spécialisation Napolitaine",
    topics: ["La pâte napolitaine (STG)", "Le cornicione (canotto)", "Cuisson au four à bois 430–480 °C", "Les classiques : Margherita, Marinara"],
    prereq: [],
    quiz: [
      { q: "La pizza napolitaine cuit à environ…", options: ["250 °C", "350 °C", "450 °C"], answer: 2 },
      { q: "Le « cornicione » désigne…", options: ["La garniture", "Le bord gonflé", "Le type de farine"], answer: 1 },
      { q: "La Marinara contient…", options: ["De la mozzarella", "Tomate, ail, origan, huile (sans fromage)", "De la crème"], answer: 1 },
    ],
    vraiFaux: [
      { s: "La Verace Pizza Napoletana est une STG (spécialité traditionnelle garantie).", v: true },
      { s: "La napolitaine cuit en 10 minutes.", v: false },
      { s: "Le canotto désigne un bord très gonflé.", v: true },
    ],
    ordre: {
      titre: "Cuisson au four à bois",
      etapes: ["Enfourner sur la sole", "Rotation de la pizza", "Coup de dôme (chaleur du haut)", "Contrôle du cornicione", "Défourner"],
    },
    flashcards: [
      { terme: "Canotto", def: "Bord très gonflé, typique de la napolitaine contemporaine." },
      { terme: "STG", def: "Spécialité Traditionnelle Garantie (label européen)." },
      { terme: "Fiordilatte", def: "Mozzarella au lait de vache, classique en napolitaine." },
    ],
  },
  {
    code: "TEGLIA", label: "In Teglia & In Pala", short: "La pizza à la plaque", icon: "🟫",
    manuel: "Manuel Technique — In Teglia & In Pala",
    topics: ["Pâte à haute hydratation (75–85 %)", "La pré-cuisson", "La vente à la part", "Gestion des plaques"],
    prereq: [],
    quiz: [
      { q: "La pizza in teglia se caractérise par…", options: ["Une pâte très sèche", "Une haute hydratation, cuite en plaque", "Une cuisson à la poêle"], answer: 1 },
      { q: "La pizza alla pala est vendue…", options: ["En part, à emporter", "Uniquement surgelée", "En calzone"], answer: 0 },
      { q: "La pré-cuisson (« pré-cotto ») sert à…", options: ["Gagner du temps au service", "Brûler la pâte", "Ajouter du sel"], answer: 0 },
    ],
    vraiFaux: [
      { s: "La teglia demande une hydratation plus élevée que la napolitaine.", v: true },
      { s: "On peut vendre la teglia à la part au poids.", v: true },
      { s: "La teglia ne nécessite jamais de pré-cuisson.", v: false },
    ],
    ordre: {
      titre: "De la pâte à la part vendue",
      etapes: ["Empâtement haute hydratation", "Fermentation longue", "Mise en plaque (huilée)", "Pré-cuisson à blanc", "Garnissage", "Cuisson finale et découpe"],
    },
    flashcards: [
      { terme: "In teglia", def: "Pizza cuite en plaque (romaine)." },
      { terme: "Alla pala", def: "Pizza allongée, cuite sur pelle, vendue à la part." },
      { terme: "Haute hydratation", def: "Pâte contenant 75 % d'eau ou plus." },
    ],
  },
  {
    code: "NIV2", label: "Niveau II — Empâtements Indirects", short: "Poolish, Biga, Contemporaine", icon: "🧪",
    manuel: "Manuel Technique Niveau II",
    topics: ["Le Poolish", "La Biga", "La pâte contemporaine", "Gestion des fermentations longues"],
    prereq: ["NIV1", "NIV1PRO"],
    quiz: [
      { q: "Le Poolish est un préferment…", options: ["Sec et ferme", "Liquide (100 % d'hydratation)", "Sans levure"], answer: 1 },
      { q: "La Biga est un préferment…", options: ["Très ferme (~45–50 %)", "Liquide", "À base de sel"], answer: 0 },
      { q: "Les empâtements indirects apportent…", options: ["Moins d'arômes", "Plus d'arômes et de digestibilité", "Rien de particulier"], answer: 1 },
    ],
    vraiFaux: [
      { s: "Le Poolish et la Biga sont des préferments.", v: true },
      { s: "La Biga est plus liquide que le Poolish.", v: false },
      { s: "Les fermentations longues améliorent la digestibilité.", v: true },
    ],
    ordre: {
      titre: "Fabriquer une pâte au Poolish",
      etapes: ["Préparer le Poolish (eau, farine, levure)", "Fermentation du Poolish (12–16 h)", "Pétrissage final avec le reste des ingrédients", "Pointage", "Boulage", "Apprêt puis façonnage"],
    },
    flashcards: [
      { terme: "Poolish", def: "Préferment liquide (100 % d'hydratation)." },
      { terme: "Biga", def: "Préferment ferme (~45–50 % d'hydratation)." },
      { terme: "Maturation", def: "Transformation des composants de la pâte dans le temps." },
    ],
  },
  {
    code: "EXPERT", label: "Spécialisation Expert", short: "Toutes les techniques", icon: "🏆",
    manuel: "Manuel Technique Niveau EXPERT",
    topics: ["Poolish & Biga avancés", "L'autolyse", "Pâte contemporaine", "In Teglia & In Pala", "Création de recettes signature"],
    prereq: ["NIV1", "NIV1PRO", "NIV2"],
    quiz: [
      { q: "L'autolyse consiste à…", options: ["Mélanger farine et eau et laisser reposer", "Cuire deux fois", "Ajouter du sucre"], answer: 0 },
      { q: "Un pizzaïolo expert maîtrise…", options: ["Une seule technique", "Directs et indirects, tous supports", "Uniquement la napolitaine"], answer: 1 },
      { q: "Une recette signature se distingue par…", options: ["Sa banalité", "Son identité et sa cohérence", "Son prix élevé"], answer: 1 },
    ],
    vraiFaux: [
      { s: "L'autolyse se fait sans sel ni levure au départ.", v: true },
      { s: "Un expert n'a plus besoin de respecter l'hygiène.", v: false },
      { s: "La force de la farine (W) influence le choix de la fermentation.", v: true },
    ],
    ordre: {
      titre: "Développer une recette signature",
      etapes: ["Choisir la technique d'empâtement", "Définir l'hydratation et la farine", "Sélectionner les produits de saison", "Tester et goûter", "Ajuster l'équilibre", "Fixer la fiche recette"],
    },
    flashcards: [
      { terme: "Autolyse", def: "Repos farine + eau avant l'ajout de sel et levure." },
      { terme: "Force (W)", def: "Indice de force boulangère d'une farine." },
      { terme: "Fiche recette", def: "Document figeant ingrédients, quantités et process." },
    ],
  },
];

export const moduleByCode = (code: string) => MODULES.find((m) => m.code === code);

// Un code de programme (formation) → code de module pédagogique.
export function programToModule(code: string): string {
  const c = code.toUpperCase();
  if (c.startsWith("NIV1PRO")) return "NIV1PRO";
  if (c.startsWith("NIV1")) return "NIV1";
  if (c.startsWith("NIV2")) return "NIV2";
  if (c.startsWith("RS7404")) return "RS7404";
  if (c.startsWith("NAPO")) return "NAPO";
  if (c.startsWith("TEGLIA")) return "TEGLIA";
  if (c.startsWith("EXPERT")) return "EXPERT";
  return "NIV1";
}

// Modules débloqués = pour chaque formation suivie, le module + ses prérequis.
export function unlockedModules(doneProgramCodes: string[]): Set<string> {
  const unlocked = new Set<string>();
  for (const code of doneProgramCodes) {
    const mod = moduleByCode(programToModule(code));
    if (!mod) continue;
    unlocked.add(mod.code);
    for (const p of mod.prereq) unlocked.add(p);
  }
  return unlocked;
}
