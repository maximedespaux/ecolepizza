// Banque de questions — Niveau I (Pizza classique), tirée du Manuel Technique Niveau I.
// Formats variés : "qcm" (choix), "vf" (vrai/faux), "assoc" (associations).
// Contenu fidèle au manuel ; à faire relire par un formateur avant diffusion large.

export const NIV1_CHAPTERS = [
  {
    title: "Le gluten", ic: "wheat", questions: [
      { t: "qcm", q: "Le gluten représente environ quelle part des protéines du blé ?", c: ["80 %", "50 %", "20 %", "100 %"], a: 0 },
      { t: "qcm", q: "Le gluten se compose majoritairement de deux protéines :", c: ["Gliadine et gluténine", "Globuline et albumine", "Amidon et fibres", "Caséine et lactose"], a: 0 },
      { t: "qcm", q: "À quoi sert le réseau de gluten dans la pâte ?", c: ["Retenir le CO₂ des levures et donner de l'élasticité", "Colorer la croûte", "Sucrer la pâte", "Détruire les levures"], a: 0 },
      { t: "vf", q: "Sans gluten, une pâte est plus cassante et friable et ne se lie pas.", a: true },
      { t: "vf", q: "Le blé dur (albumen vitreux) est surtout utilisé pour faire la pizza.", a: false },
      { t: "vf", q: "Le réseau de gluten se forme lorsque la farine est mélangée à l'eau, pendant le pétrissage.", a: true },
    ],
  },
  {
    title: "La farine (indice W)", ic: "package", questions: [
      { t: "qcm", q: "Pour une pizza napolitaine, quel indice de force (W) est recommandé ?", c: ["W 250–310", "W 120–150", "W 200", "W 400–430"], a: 0 },
      { t: "qcm", q: "Que mesure le « W » d'une farine ?", c: ["La force boulangère (travail pour déformer le pâton)", "Le taux d'humidité", "Le poids du sac", "La couleur"], a: 0 },
      { t: "vf", q: "L'indice W est imprimé sur le sac de farine.", a: false },
      { t: "qcm", q: "Les farines « Manitoba » (W 400–430) servent surtout à :", c: ["Renforcer des farines plus faibles", "Faire des biscuits", "Remplacer la levure", "Colorer la pâte"], a: 0 },
      { t: "assoc", q: "Associe chaque indice W à son usage :", pairs: [["W 120–150", "Biscuits & crackers"], ["W 250–310", "Pizza napolitaine"], ["W 400–430", "Renfort (Manitoba)"]] },
      { t: "vf", q: "Pour 100 kg de blé, on obtient en moyenne environ 75 kg de farine.", a: true },
    ],
  },
  {
    title: "La levure", ic: "yeast", questions: [
      { t: "qcm", q: "Quelle variété de levure est utilisée en panification ?", c: ["Saccharomyces cerevisiae", "Penicillium", "Lactobacillus", "Escherichia coli"], a: 0 },
      { t: "qcm", q: "L'eau détruit la levure au-delà de quelle température ?", c: ["50 °C", "38 °C", "20 °C", "0 °C"], a: 0 },
      { t: "qcm", q: "Dose usuelle de levure fraîche par kilo de farine ?", c: ["2 à 4 g", "20 g", "0,1 g", "50 g"], a: 0 },
      { t: "vf", q: "La transformation des sucres en CO₂ et alcool par la levure s'appelle la fermentation alcoolique.", a: true },
      { t: "qcm", q: "Pour réhydrater la levure sèche active, l'eau doit être à environ :", c: ["38 °C", "60 °C", "10 °C", "100 °C"], a: 0 },
      { t: "vf", q: "Une dose de levure trop élevée donne une pâte plus savoureuse et qui se conserve mieux.", a: false },
    ],
  },
  {
    title: "L'eau & la température", ic: "droplet", questions: [
      { t: "qcm", q: "Comment nomme-t-on l'eau servant au pétrissage de la pâte ?", c: ["L'eau de coulage", "L'eau de bassinage", "L'eau de source", "L'eau dure"], a: 0 },
      { t: "qcm", q: "Formule de l'école (TB = 50) : farine à 17 °C → eau de coulage à…", c: ["16 °C", "34 °C", "33 °C", "8 °C"], a: 0 },
      { t: "vf", q: "L'eau utilisée pour l'empâtement doit être potable.", a: true },
      { t: "qcm", q: "Une eau « dure » donne une pâte…", c: ["Dure et peu levée", "Très souple", "Idéale", "Collante"], a: 0 },
      { t: "vf", q: "Une eau moyennement dure (15–30 °f) est idéale pour la pâte.", a: true },
    ],
  },
  {
    title: "Le sel", ic: "salt", questions: [
      { t: "qcm", q: "Dosage usuel du sel en panification ?", c: ["17 à 22 g / kg de farine", "2 à 4 g / kg", "50 g / kg", "100 g / kg"], a: 0 },
      { t: "qcm", q: "Quel est l'effet du sel sur la fermentation ?", c: ["Il la freine et la régularise", "Il l'accélère fortement", "Aucun effet", "Il remplace la levure"], a: 0 },
      { t: "vf", q: "Le sel renforce la maille glutamique (la gliadine devient moins soluble).", a: true },
      { t: "qcm", q: "Le sel marin est obtenu par…", c: ["Évaporation de l'eau de mer (marais salants)", "Extraction en mine", "Synthèse chimique", "Fermentation"], a: 0 },
      { t: "vf", q: "Le sel améliore la coloration et le croustillant de la croûte.", a: true },
    ],
  },
  {
    title: "L'huile", ic: "oil", questions: [
      { t: "vf", q: "L'huile d'olive est un ingrédient indispensable dans une pâte à pizza.", a: false },
      { t: "qcm", q: "La vraie pizza napolitaine (UNESCO) contient-elle de l'huile dans la pâte ?", c: ["Non", "Oui, 5 %", "Oui, obligatoire", "Seulement l'hiver"], a: 0 },
      { t: "qcm", q: "Une huile d'olive « extra vierge » a une acidité :", c: ["Inférieure à 0,8 %", "Supérieure à 3,3 %", "De 2 %", "De 5 %"], a: 0 },
      { t: "qcm", q: "Rôle principal de l'huile dans l'empâtement direct ?", c: ["Figer le pâton en maturation (éviter l'affaissement)", "Faire lever la pâte", "Colorer la croûte", "Saler la pâte"], a: 0 },
      { t: "assoc", q: "Associe chaque huile à son acidité :", pairs: [["Extra vierge", "< 0,8 %"], ["Vierge", "≤ 2 %"], ["1er prix", "> 3,3 %"]] },
    ],
  },
  {
    title: "Empâtement direct & autolyse", ic: "refresh", questions: [
      { t: "qcm", q: "Dans l'empâtement direct, quand ajoute-t-on le sel ?", c: ["En 3ᵉ phase, petit à petit (puis l'huile)", "En tout premier avec la farine", "Jamais", "Dans l'eau de coulage"], a: 0 },
      { t: "qcm", q: "Le « pointage » désigne…", c: ["Le repos de la pâte après le pétrissage", "La cuisson", "Le façonnage du disque", "Le nappage"], a: 0 },
      { t: "vf", q: "L'autolyse permet d'obtenir une pâte plus extensible.", a: true },
      { t: "qcm", q: "Température finale idéale de la pâte en fin de pétrissage ?", c: ["23 à 25 °C", "10 °C", "40 °C", "55 °C"], a: 0 },
      { t: "vf", q: "En autolyse, on mélange d'abord farine + eau et on laisse reposer avant d'ajouter sel et levure.", a: true },
      { t: "qcm", q: "Le taux d'hydratation minimum en empâtement direct est d'environ :", c: ["54 %", "30 %", "80 %", "100 %"], a: 0 },
    ],
  },
  {
    title: "Cuisson, fours & pétrins", ic: "flame", questions: [
      { t: "qcm", q: "Température de cuisson d'une pizza napolitaine ?", c: ["400 à 450 °C", "180 °C", "250 °C", "320 °C"], a: 0 },
      { t: "assoc", q: "Associe chaque type de pizza à sa température de cuisson :", pairs: [["Classique", "320–360 °C"], ["Napolitaine", "400–450 °C"], ["Plaque (teglia)", "320 °C"]] },
      { t: "qcm", q: "La chaleur transmise par contact direct avec la sole s'appelle…", c: ["La conduction", "Le rayonnement", "La convection", "L'induction"], a: 0 },
      { t: "vf", q: "Un four à bois doit être ramoné 2 fois par an.", a: true },
      { t: "qcm", q: "Le pétrin à spirale travaille des quantités de pâte de…", c: ["10 à 60 kg", "1 à 2 kg", "100 à 200 kg", "moins d'1 kg"], a: 0 },
      { t: "vf", q: "Le pétrin à spirale, plus rapide, accélère la formation de la maille gluténique.", a: true },
    ],
  },
];
