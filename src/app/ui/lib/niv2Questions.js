// Banque de questions — Niveau II (Empâtements indirects « Poolish · Biga »), tirée du
// Manuel Technique NIVEAU II. Le Niveau I couvre déjà gluten / farine / levure / eau / sel /
// huile : cette banque porte sur ce que le Niveau II apporte VRAIMENT — la méthode indirecte,
// le poolish, la biga, leurs protocoles, et le choix d'un empâtement selon le service.
//
// Formats : "qcm" (choix), "vf" (vrai/faux), "assoc" (associations).
// La bonne réponse d'un qcm est écrite en premier (a: 0) pour se relire facilement — le jeu
// mélange les choix à l'affichage (cf. PizzaQuest.jsx), donc la position ne trahit rien.
// Les vrai/faux sont volontairement équilibrés (autant de vrai que de faux) : sinon répondre
// toujours « vrai » suffit à passer.
//
// Contenu fidèle au manuel ; à faire relire par un formateur avant diffusion large.

export const NIV2_CHAPTERS = [
  {
    title: "Direct ou indirect", ic: "refresh", questions: [
      { t: "qcm", q: "Combien d'étapes compte un empâtement indirect (biga ou poolish) ?", c: ["2 étapes : un pré-ferment, puis la pâte finale", "1 seule étape", "3 étapes", "Autant qu'on veut"], a: 0 },
      { t: "qcm", q: "En méthode directe, on…", c: ["Mélange tous les ingrédients en une seule fois", "Prépare d'abord un pré-ferment", "Ne met pas de levure", "Pétrit toujours 20 minutes"], a: 0 },
      { t: "qcm", q: "Selon le manuel, quels avantages l'indirect apporte-t-il face au direct ?", c: ["Meilleur goût, arômes plus intenses, meilleure digestion", "Une pâte moins chère", "Un pétrissage plus court", "Moins de levure à acheter"], a: 0 },
      { t: "vf", q: "En 1ère phase d'un empâtement indirect, on prépare un pré-ferment avec de la farine, de l'eau et de la levure, laissé à température ambiante.", a: true },
      { t: "vf", q: "La méthode indirecte demande plus de temps de fermentation totale que la méthode directe pour une qualité équivalente.", a: false },
      { t: "assoc", q: "Associe chaque méthode à son nombre d'étapes :", pairs: [["Direct", "1 étape"], ["Poolish", "2 étapes"], ["Biga", "2 étapes"]] },
    ],
  },
  {
    title: "Le poolish", ic: "droplet", questions: [
      { t: "qcm", q: "Le poolish est un pré-ferment…", c: ["Liquide", "Solide", "Sec", "Gras"], a: 0 },
      { t: "qcm", q: "En 1ère phase d'un poolish, quelle quantité de farine met-on ?", c: ["Le poids de l'eau (donc autant de farine que d'eau)", "La moitié du poids de l'eau", "Le double du poids de l'eau", "Toute la farine de la recette"], a: 0 },
      { t: "qcm", q: "Quelle part de la levure part en 1ère phase du poolish ?", c: ["2/3 de la levure", "1/3 de la levure", "Toute la levure", "Aucune"], a: 0 },
      { t: "qcm", q: "Combien de temps le poolish repose-t-il à température ambiante ?", c: ["12 à 15 heures maximum", "1 à 2 heures", "24 à 30 heures", "48 heures"], a: 0 },
      { t: "vf", q: "Le poolish double voire triple de volume en 1ère phase : attention au débordement du pétrin.", a: true },
      { t: "vf", q: "Une pâte au poolish se conserve une semaine sans problème.", a: false },
    ],
  },
  {
    title: "La biga", ic: "package", questions: [
      { t: "qcm", q: "La biga est un pré-ferment…", c: ["Solide (un « starter »)", "Liquide", "À 100 % d'hydratation", "Sans levure"], a: 0 },
      { t: "qcm", q: "Quelle hydratation pour la 1ère phase d'une biga ?", c: ["45 % du poids de la farine de la 1ère phase", "100 % du poids de la farine", "60 % du poids de la farine", "25 % du poids de la farine"], a: 0 },
      { t: "qcm", q: "Quelle dose de levure fraîche en 1ère phase de biga ?", c: ["1 % du poids de la farine de la 1ère phase", "0,1 % du poids de la farine", "5 % du poids de la farine", "2/3 de la levure totale"], a: 0 },
      { t: "qcm", q: "Après 1 à 2 minutes de mélange, à quoi doit ressembler la biga ?", c: ["Une pâte filandreuse, non homogène", "Une pâte lisse et homogène", "Un liquide laiteux", "Une pâte collante et brillante"], a: 0 },
      { t: "qcm", q: "Combien de temps la biga repose-t-elle, et à quelle température ?", c: ["16 à 20 h maximum, entre 19 et 24 °C", "12 à 15 h, entre 3 et 4 °C", "2 h à 30 °C", "48 h à température ambiante"], a: 0 },
      { t: "vf", q: "En 2ème phase de biga, on délaye d'abord 1/4 de l'eau manquante dans la biga pour obtenir un liquide laiteux, qu'on laisse reposer 10 minutes.", a: true },
    ],
  },
  {
    title: "Doser sa biga", ic: "list-checks", questions: [
      { t: "qcm", q: "Pour 10 kg de farine, une biga à 20 % demande en 1ère phase :", c: ["2 kg de farine et 0,900 kg d'eau", "2 kg de farine et 2 kg d'eau", "4 kg de farine et 1,800 kg d'eau", "1 kg de farine et 0,450 kg d'eau"], a: 0 },
      { t: "qcm", q: "Pour 10 kg de farine, une biga à 40 % demande en 1ère phase :", c: ["4 kg de farine et 1,800 kg d'eau", "4 kg de farine et 4 kg d'eau", "2 kg de farine et 0,900 kg d'eau", "3 kg de farine et 1,350 kg d'eau"], a: 0 },
      { t: "qcm", q: "La levure sèche instantanée se dose, en 1ère phase, à :", c: ["0,5 % du poids de la farine de la 1ère phase", "1 % du poids de la farine", "2 % du poids de la farine", "La même dose que la fraîche"], a: 0 },
      { t: "qcm", q: "À W égal, que devient l'eau totale quand le pourcentage de biga augmente ?", c: ["Elle diminue", "Elle augmente", "Elle ne bouge pas", "Elle double"], a: 0 },
      { t: "vf", q: "Une biga à 30 % pour 10 kg de farine utilise 3 kg de farine et 30 g de levure fraîche en 1ère phase.", a: true },
      { t: "vf", q: "Plus la farine est forte (W élevé), moins on met d'eau au total.", a: false },
    ],
  },
  {
    title: "Le protocole", ic: "clock", questions: [
      { t: "qcm", q: "Après un empâtement indirect (biga ou poolish), que fait-on du pointage ?", c: ["Pas de pointage : on boule de suite et on bloque au froid", "Un pointage de 30 minutes", "Un pointage de 2 heures", "Un pointage d'une nuit"], a: 0 },
      { t: "qcm", q: "Combien de temps dure la détente avant de diviser ?", c: ["5 minutes", "30 minutes", "1 heure", "Pas de détente"], a: 0 },
      { t: "qcm", q: "À quelle épaisseur étale-t-on la masse avant de diviser ?", c: ["10 cm, en forme rectangulaire", "1 cm, en forme ronde", "30 cm, en boule", "3 cm, en rectangle"], a: 0 },
      { t: "qcm", q: "À quelle température bloque-t-on les pâtons en bacs ?", c: ["Entre 3 et 4 °C", "Entre 19 et 24 °C", "À −18 °C", "À température ambiante"], a: 0 },
      { t: "qcm", q: "Quand ajoute-t-on le sel et l'huile d'olive ?", c: ["En fin de pétrissage, on laisse tourner 2 à 3 minutes", "Tout au début, avec la farine", "Dans le pré-ferment de 1ère phase", "Après le blocage au froid"], a: 0 },
      { t: "vf", q: "La 1ère phase de la biga se fait au réfrigérateur, entre 3 et 4 °C.", a: false },
    ],
  },
  {
    title: "Choisir son empâtement", ic: "check-circle", questions: [
      { t: "qcm", q: "Pour une pizza à emporter, quel empâtement est le plus adapté ?", c: ["Le direct ou la biga", "La napolitaine", "Le poolish", "La contemporaine"], a: 0 },
      { t: "qcm", q: "Quel empâtement est le moins adapté à l'emporté ?", c: ["La napolitaine", "La biga", "Le direct", "Le poolish"], a: 0 },
      { t: "qcm", q: "Selon le tableau du manuel, quel empâtement est le plus difficile à stocker ?", c: ["Le direct et la contemporaine", "La biga", "Le poolish", "Tous se stockent pareil"], a: 0 },
      { t: "qcm", q: "Quel empâtement est le plus facile à étaler ?", c: ["Le direct", "La napolitaine", "Le poolish", "La contemporaine"], a: 0 },
      { t: "vf", q: "Le direct donne une pâte plus moelleuse que la biga.", a: false },
      { t: "vf", q: "La biga est très adaptée au stockage comme à la texture moelleuse.", a: true },
    ],
  },
];
