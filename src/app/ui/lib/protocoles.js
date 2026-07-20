/**
 * Référentiel d'évaluation « Artisan pizzaïolo » — les 13 protocoles, en données.
 *
 * ⚠️ CE FICHIER FAIT FOI. Les barèmes du dossier RNCP (`~/Documents/Ecole RNCP`) recopient
 * ces valeurs, jamais l'inverse. C'est exactement l'écart entre deux documents qui a fait
 * tomber le dossier RS n° 37 616 — « les voies d'accès diffèrent d'un support à l'autre » —
 * et qui existait encore dans les fichiers v22 : la confection des abaisses y valait 57
 * points au référentiel et 36 au protocole. Un jury notait donc différemment selon la
 * feuille qu'il avait en main.
 *
 * Source des gestes et des paliers : `Fiche technique rncp v22.xlsx` de l'école, protocoles
 * 1-B1 à 13. Les valeurs retenues sont celles DES PROTOCOLES, qui sont les documents que le
 * jury utilise réellement.
 *
 * Deux corrections apportées à la v22, l'une et l'autre dictées par un motif de refus :
 *   · C2.5 avait ZÉRO point — elle était « évaluée au travers du barème de temps du
 *     protocole 12 », c'est-à-dire au travers d'une AUTRE compétence. Or c'est elle qui
 *     porte les principes de prévention en santé et sécurité au travail exigés par le
 *     décret n° 2025-500. Elle a donc ses propres critères, et les 13 points de temps lui
 *     sont transférés depuis C2.4.
 *   · Les bornes de temps se recouvraient (« ≤ 2 mn » et « 2 à 3 mn » : à 2 minutes pile,
 *     deux règles s'appliquaient). Elles sont désormais disjointes.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────
   MODES DE SAISIE
   `points`  — une valeur libre de 0 à max (entretien technique, épreuve écrite)
   `palier`  — un choix parmi des paliers exclusifs (dorée / taches / brûlée)
   `items`   — un palier PAR item répété (6 pâtons, 5 ingrédients, 3 pizzas)
   Un critère `elim: true` est éliminatoire : non coché, le bloc tombe quel que soit le total.
   ──────────────────────────────────────────────────────────────────────────────────────── */

const OUI_NON = [{ v: null, l: 'Conforme' }, { v: 0, l: 'Non conforme' }];
const TEXTURE = [{ v: 4, l: 'Souple et homogène' }, { v: 0, l: 'Granuleuse ou loupée' }];
const TEMP_PATE = [{ v: 4, l: 'de 20 à 24 °C' }, { v: 0, l: 'au-delà de 24 °C' }];

/* Les cinq gestes d'hygiène, identiques aux protocoles 1-B1, 1-B2 et 1-B3. */
const hygiene = (proto, ligne3) => ({
    code: 'HYG', label: `Hygiène — protocole ${proto}`, elim: true,
    points: ligne3 ? 20 : 16,
    criteres: [
        { id: `${proto}-tenue`, label: 'Tenue professionnelle propre', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Propre et complète' }, { v: 0, l: 'Non conforme' }] },
        { id: `${proto}-mains`, label: 'Lavage des mains et brossage des ongles à l\'entrée et après chaque étape', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Respecté' }, { v: 0, l: 'Non respecté' }] },
        ...(ligne3 ? [{ id: `${proto}-bacs`, label: ligne3, max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Respecté' }, { v: 0, l: 'Non respecté' }] }] : []),
        { id: `${proto}-plan`, label: 'Nettoyage du plan de travail', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Respecté' }, { v: 0, l: 'Non respecté' }] },
        { id: `${proto}-mat`, label: 'Nettoyage des petits et gros matériels', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Respecté' }, { v: 0, l: 'Non respecté' }] },
    ],
});

export const BLOCS = [
    {
        code: 'BC01', label: 'Conduire les empâtements', points: 182,
        modalite: 'Mise en situation sur deux demi-journées (2 × 2 h) · entretien technique 20 mn · épreuve écrite',
        competences: [
            {
                code: 'C1.1', label: 'Choisir une méthode d\'empâtement', points: 18, nonCompensable: true,
                aide: 'Ce qui distingue le niveau 4 du niveau 3 : le candidat décide, il n\'applique pas.',
                criteres: [
                    { id: 'c11', label: 'Différencie les trois empâtements, justifie son choix au regard du délai imposé et énonce une limite de la méthode retenue', max: 18, mode: 'points' },
                ],
            },
            {
                code: 'C1.2', label: 'Sélectionner une farine', points: 12, nonCompensable: true,
                criteres: [
                    { id: 'c12', label: 'Sélectionne type et force (W) selon l\'empâtement, rattache au temps de maturation et à l\'étalage à la main', max: 12, mode: 'points' },
                ],
            },
            {
                code: 'C1.3', label: 'Calculer un empâtement', points: 10,
                criteres: [
                    { id: 'c13', label: 'Complète la fiche technique « pâte » ; température d\'eau de coulage exacte à ±1 °C', max: 10, mode: 'points' },
                ],
            },
            {
                code: 'C1.4', label: 'Conduire un empâtement direct — protocole 2', points: 18,
                criteres: [
                    { id: 'p2-ordre', label: 'Ordre d\'incorporation', mode: 'items', parItem: 2, items: ['Farine', 'Levure', 'Eau', 'Sel', 'Huile'], paliers: [{ v: 2, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                    { id: 'p2-temp', label: 'Température en fin de pétrissage', max: 4, mode: 'palier', paliers: TEMP_PATE },
                    { id: 'p2-text', label: 'Texture de la pâte', max: 4, mode: 'palier', paliers: TEXTURE },
                ],
            },
            {
                code: 'C1.5', label: 'Conduire un empâtement indirect — protocoles 3 et 4', points: 32,
                aide: 'Poolish : 1re phase eau 600 g, levure 3 g, farine 600 g · repos 12 à 15 h. ' +
                      'Biga : farine 300 g, levure 3 g, eau 135 g (45 %) · frasage 2 mn · repos 16 à 20 h à 19-24 °C.',
                criteres: [
                    { id: 'p3-ordre', label: 'Poolish, 2e phase — ordre d\'incorporation', mode: 'items', parItem: 2, items: ['Farine 400 g', 'Sel 20 g', 'Huile 25 g'], paliers: [{ v: 2, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                    { id: 'p3-temp', label: 'Poolish — température', max: 4, mode: 'palier', paliers: TEMP_PATE },
                    { id: 'p3-text', label: 'Poolish — texture', max: 4, mode: 'palier', paliers: TEXTURE },
                    { id: 'p4-ordre', label: 'Biga, 2e phase — ordre d\'incorporation', mode: 'items', parItem: 2, items: ['Farine 700 g', 'Eau 465 g', 'Pâte de 1re phase', 'Sel 20 g', 'Huile 25 g'], paliers: [{ v: 2, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                    { id: 'p4-temp', label: 'Biga — température', max: 4, mode: 'palier', paliers: TEMP_PATE },
                    { id: 'p4-text', label: 'Biga — texture', max: 4, mode: 'palier', paliers: TEXTURE },
                ],
            },
            {
                code: 'C1.6', label: 'Fermentation, division, blocage — protocole 5', points: 64,
                aide: '6 pâtons de 250 g en 3 minutes maximum.',
                criteres: [
                    { id: 'p5-div', label: 'Diviser et peser', mode: 'items', parItem: 2, items: ['Pâton 1', 'Pâton 2', 'Pâton 3', 'Pâton 4', 'Pâton 5', 'Pâton 6'], paliers: [{ v: 2, l: 'Au poids' }, { v: 0, l: 'Hors poids' }] },
                    { id: 'p5-boul', label: 'Bouler', mode: 'items', parItem: 4, items: ['Pâton 1', 'Pâton 2', 'Pâton 3', 'Pâton 4', 'Pâton 5', 'Pâton 6'], paliers: [{ v: 4, l: 'Serré et rond' }, { v: 2, l: 'Mal serré' }, { v: 0, l: 'Déchiré' }] },
                    { id: 'p5-temps', label: 'Temps de confection des 6 pâtons', max: 24, mode: 'palier', paliers: [{ v: 24, l: 't ≤ 2 mn' }, { v: 12, l: '2 mn < t ≤ 3 mn' }, { v: 0, l: 't > 3 mn' }] },
                    { id: 'p5-bacs', label: 'Pâtons en bacs couverts, identifiés, bloqués entre 3 et 4 °C', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Conforme' }, { v: 0, l: 'Non conforme' }] },
                ],
            },
            {
                code: 'C1.7', label: 'Diagnostiquer un défaut de pâte', points: 12, nonCompensable: true,
                aide: 'Trois pâtes-témoins : une collante, une rétractante, une sur-fermentée.',
                criteres: [
                    { id: 'c17', label: 'Nomme les trois défauts, identifie une cause pour au moins deux, énonce la correction', max: 12, mode: 'points' },
                ],
            },
            // Le protocole 1-B1 de la v22 comportait une ligne « mettre les pâtons en bacs
            // couverts » — déjà notée 4 points en C1.6 (`p5-bacs`). Le même geste valait donc
            // 4 points ordinaires d'un côté et faisait tomber le bloc de l'autre, selon la
            // feuille que le jury avait en main. Il reste en C1.6, où il relève du blocage au
            // froid, et sort de l'éliminatoire.
            hygiene('1-B1', null),
        ],
        secuNote: 'Arrêt du pétrin avant toute intervention dans la cuve — condition de validité, sans points.',
    },

    {
        code: 'BC02', label: 'Produire et cuire la gamme', points: 318,
        modalite: 'Mise en situation de 2 h 30 en conditions de service — Reine, Poulet aux poivrons, Calzone',
        competences: [
            {
                code: 'C2.1', label: 'Façonner — protocole 7', points: 36,
                criteres: [
                    { id: 'p7-depot', label: 'Déposer sur le plan fariné', mode: 'items', parItem: 1, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 1, l: 'Fait' }, { v: 0, l: 'Non fait' }] },
                    { id: 'p7-doigts', label: 'Agrandir le disque du bout des doigts', mode: 'items', parItem: 1, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 1, l: 'Fait' }, { v: 0, l: 'Non fait' }] },
                    { id: 'p7-circ', label: 'Mouvements circulaires', mode: 'items', parItem: 3, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 3, l: 'Maîtrisés' }, { v: 0, l: 'Non maîtrisés' }] },
                    { id: 'p7-corn', label: 'Corniche d\'1,5 cm d\'épaisseur', mode: 'items', parItem: 3, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 3, l: 'Conforme' }, { v: 0, l: 'Non conforme' }] },
                    { id: 'p7-vol', label: 'Faire voler le disque', mode: 'items', parItem: 1, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 1, l: 'Fait' }, { v: 0, l: 'Non fait' }] },
                    { id: 'p7-diam', label: 'Diamètre imposé atteint', mode: 'items', parItem: 3, items: ['Pâton 1', 'Pâton 2', 'Pâton 3'], paliers: [{ v: 3, l: 'Atteint' }, { v: 0, l: 'Non atteint' }] },
                ],
            },
            {
                code: 'C2.2', label: 'Garnir — protocoles 6, 8, 9 et 10', points: 91,
                criteres: [
                    { id: 'p6-prep', label: 'Préparation des ingrédients — poivrons lavés (5), épépinés (1), découpe régulière (1) ; champignons nettoyés (5), découpe (1) ; jambon (1) ; poulet découpé (1) et assaisonné (1)', max: 16, mode: 'points' },
                    { id: 'bases', label: 'Bases à froid — sauce tomate et crème de poivrons aux quantités demandées', max: 15, mode: 'points' },
                    { id: 'louche', label: 'Sauce ou crème à la louche, en spirale, à 1,5 cm du bord', mode: 'items', parItem: 5, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 5, l: 'Conforme' }, { v: 0, l: 'Non conforme' }] },
                    { id: 'p8', label: 'Ordre Reine — sauce tomate, champignons, jambon, mozzarella, olives', mode: 'items', parItem: 3, items: ['Sauce tomate', 'Champignons', 'Jambon', 'Mozzarella', 'Olives'], paliers: [{ v: 3, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                    { id: 'p9', label: 'Ordre Poulet aux poivrons — mozzarella, poulet, poivrons, crème, olives noires', mode: 'items', parItem: 3, items: ['Mozzarella', 'Poulet', 'Poivrons', 'Crème de poivron', 'Olives noires'], paliers: [{ v: 3, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                    { id: 'p10', label: 'Ordre Calzone — sauce tomate, champignons, jambon, mozzarella, œuf', mode: 'items', parItem: 3, items: ['Sauce tomate', 'Champignons', 'Jambon', 'Mozzarella', 'Œuf'], paliers: [{ v: 3, l: 'Au bon rang' }, { v: 0, l: 'Hors rang' }] },
                ],
            },
            {
                code: 'C2.3', label: 'Cuire — protocole 11', points: 42,
                aide: 'Le candidat vérifie la température du four avant enfournement.',
                criteres: [
                    { id: 'p11-enf', label: 'Enfourner sans déchirer ni déformer', mode: 'items', parItem: 5, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 5, l: 'Maîtrisé' }, { v: 0, l: 'Non maîtrisé' }] },
                    { id: 'p11-tour', label: 'Tourner par gestes rotatifs', mode: 'items', parItem: 5, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 5, l: 'Maîtrisé' }, { v: 0, l: 'Non maîtrisé' }] },
                    { id: 'p11-def', label: 'Défourner', mode: 'items', parItem: 4, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 4, l: 'Maîtrisé' }, { v: 0, l: 'Non maîtrisé' }] },
                ],
            },
            {
                code: 'C2.4', label: 'Apprécier le produit fini — protocole 12', points: 87,
                criteres: [
                    // La rondeur ne s'apprécie que sur les deux pizzas rondes : la Calzone est un chausson
                    // et porte sa propre ligne. Les noter toutes les trois donnerait 9 points là où
                    // le protocole 12 en prévoit 6.
                    { id: 'p12-forme', label: 'Forme — rondeur', mode: 'items', parItem: 3, items: ['Reine', 'Poulet aux poivrons'], paliers: [{ v: 3, l: 'Ronde' }, { v: 2, l: 'Ovale' }, { v: 0, l: 'Difforme' }] },
                    { id: 'p12-crois', label: 'Croissant de la Calzone', max: 3, mode: 'palier', paliers: [{ v: 3, l: 'Forme de croissant' }, { v: 2, l: 'Trop allongé' }, { v: 0, l: 'Difforme' }] },
                    { id: 'p12-dessous', label: 'Cuisson du dessous de la pâte', mode: 'items', parItem: 7, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 7, l: 'Dorée' }, { v: 4, l: 'Taches brunâtres' }, { v: 0, l: 'Brûlée' }] },
                    { id: 'p12-dessus', label: 'Cuisson du dessus de la pâte', mode: 'items', parItem: 7, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 7, l: 'Dorée' }, { v: 4, l: 'Taches brunâtres' }, { v: 0, l: 'Brûlée' }] },
                    { id: 'p12-tenue', label: 'Tenue de la pizza', mode: 'items', parItem: 4, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 4, l: 'Correcte' }, { v: 2, l: 'Moyenne' }, { v: 0, l: 'Aucune tenue' }] },
                    { id: 'p12-gout', label: 'Goût', mode: 'items', parItem: 4, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 4, l: 'Très goûteuse' }, { v: 2, l: 'Goûteuse' }, { v: 0, l: 'Insipide' }] },
                    { id: 'p12-esth', label: 'Esthétique', mode: 'items', parItem: 4, items: ['Reine', 'Poulet aux poivrons', 'Calzone'], paliers: [{ v: 4, l: 'Harmonieuse' }, { v: 2, l: 'Disproportionnée' }, { v: 0, l: 'Loupée' }] },
                ],
            },
            {
                code: 'C2.5', label: 'Tenir la cadence et son poste en sécurité', points: 32, nonCompensable: true,
                aide: 'Porte les principes de prévention en santé et sécurité au travail — article L. 4121-2 du code du travail, exigé par le décret n° 2025-500.',
                criteres: [
                    { id: 'c25-temps', label: 'Temps de réalisation des 3 pizzas', max: 13, mode: 'palier', paliers: [{ v: 13, l: 't ≤ 15 mn' }, { v: 7, l: '15 mn < t ≤ 17 mn' }, { v: 0, l: 't > 17 mn' }] },
                    { id: 'c25-mep', label: 'Mise en place complète avant le premier enfournement', max: 5, mode: 'palier', paliers: [{ v: 5, l: 'Complète' }, { v: 0, l: 'Incomplète' }] },
                    { id: 'c25-desserte', label: 'Desserte maintenue dégagée pendant tout le service', max: 5, mode: 'palier', paliers: [{ v: 5, l: 'Dégagée' }, { v: 0, l: 'Encombrée' }] },
                    { id: 'c25-pelle', label: 'Usage de la pelle et des maniques conforme, pas de bras au-dessus de la sole', max: 5, mode: 'palier', paliers: [{ v: 5, l: 'Conforme' }, { v: 0, l: 'Non conforme' }] },
                    { id: 'c25-signal', label: 'Signalement oral des sols glissants et des surfaces chaudes', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Fait' }, { v: 0, l: 'Non fait' }] },
                ],
                elimNote: 'Aucune manipulation dangereuse à l\'enfournement — condition de validité.',
            },
            hygiene('1-B2', 'Préparations du service réservées en bacs hermétiques, remises au froid dès l\'usage'),
            {
                code: 'C2.7', label: 'Informer sur la composition', points: 10,
                aide: 'Un membre du jury joue un client et interroge sur la composition d\'un produit.',
                criteres: [
                    { id: 'c27', label: 'Identifie sans omission les allergènes présents et indique où l\'information écrite est tenue à disposition', max: 10, mode: 'points' },
                ],
                elimNote: 'Aucune affirmation d\'absence d\'allergène fausse au regard de la fiche recette.',
            },
        ],
    },

    {
        code: 'BC03', label: 'Concevoir une offre et en établir la rentabilité', points: 198,
        modalite: 'Épreuve écrite sur dossier 2 h · mise en situation de création 1 h · soutenance 30 mn',
        competences: [
            {
                code: 'C3.1', label: 'Créer une recette — protocole 13', points: 76,
                aide: 'Une pizza diététique — végétarienne ou vegan — et une pizza gourmet, à partir du panier de saison.',
                criteres: [
                    { id: 'p13-forme', label: 'Forme — rondeur', mode: 'items', parItem: 5, items: ['Diététique', 'Gourmet'], paliers: [{ v: 5, l: 'Ronde' }, { v: 2, l: 'Ovale' }, { v: 0, l: 'Difforme' }] },
                    { id: 'p13-dessous', label: 'Cuisson du dessous', mode: 'items', parItem: 3, items: ['Diététique', 'Gourmet'], paliers: [{ v: 3, l: 'Dorée' }, { v: 1.5, l: 'Taches brunâtres' }, { v: 0, l: 'Brûlée' }] },
                    { id: 'p13-dessus', label: 'Cuisson du dessus', mode: 'items', parItem: 3, items: ['Diététique', 'Gourmet'], paliers: [{ v: 3, l: 'Dorée' }, { v: 1.5, l: 'Taches brunâtres' }, { v: 0, l: 'Brûlée' }] },
                    { id: 'p13-tenue', label: 'Tenue', mode: 'items', parItem: 3, items: ['Diététique', 'Gourmet'], paliers: [{ v: 3, l: 'Correcte' }, { v: 1.5, l: 'Moyenne' }, { v: 0, l: 'Aucune' }] },
                    { id: 'p13-gout', label: 'Goût', mode: 'items', parItem: 6, items: ['Diététique', 'Gourmet'], paliers: [{ v: 6, l: 'Très goûteuse' }, { v: 3, l: 'Goûteuse' }, { v: 0, l: 'Insipide' }] },
                    { id: 'p13-equil', label: 'Équilibre des saveurs', mode: 'items', parItem: 6, items: ['Diététique', 'Gourmet'], paliers: [{ v: 6, l: 'Bien équilibré' }, { v: 3, l: 'Équilibré' }, { v: 0, l: 'Pas du tout' }] },
                    { id: 'p13-creat', label: 'Créativité', mode: 'items', parItem: 6, items: ['Diététique', 'Gourmet'], paliers: [{ v: 6, l: 'Originale' }, { v: 3, l: 'Classique' }, { v: 0, l: 'Basique' }] },
                    { id: 'p13-esth', label: 'Esthétique', mode: 'items', parItem: 6, items: ['Diététique', 'Gourmet'], paliers: [{ v: 6, l: 'Harmonieuse' }, { v: 3, l: 'Disproportionnée' }, { v: 0, l: 'Loupée' }] },
                ],
            },
            {
                code: 'C3.2', label: 'Formaliser en fiche technique', points: 36,
                criteres: [
                    { id: 'c32', label: 'Fiches complètes : ingrédients, quantités unitaires, progression, allergènes. Une fiche tirée au sort permet à un tiers de reproduire le produit', max: 36, mode: 'points' },
                ],
            },
            {
                code: 'C3.3', label: 'Calculer le coût matière', points: 30, nonCompensable: true,
                criteres: [
                    { id: 'c33', label: 'Coût matière calculé sur les tarifs fournis, rendements et pertes inclus — juste à ±2 % du recalcul du jury', max: 30, mode: 'points' },
                ],
            },
            {
                code: 'C3.4', label: 'Fixer un prix et vérifier la marge', points: 25, nonCompensable: true,
                criteres: [
                    { id: 'c34', label: 'Marge brute, coefficient multiplicateur et ratio exacts ; TVA correcte selon le mode de consommation', max: 25, mode: 'points' },
                ],
            },
            {
                code: 'C3.5', label: 'Construire une carte', points: 10,
                criteres: [
                    { id: 'c35', label: 'Carte cohérente ; produit d\'appel et produit à forte marge identifiés ; mutualisation des ingrédients expliquée', max: 10, mode: 'points' },
                ],
            },
            {
                code: 'C3.6', label: 'Exploiter un outil numérique de gestion', points: 5, nonCompensable: true,
                aide: 'Le jury annonce une hausse de prix d\'achat en soutenance.',
                criteres: [
                    { id: 'c36', label: 'Applique la hausse dans son outil, recalcule les coûts touchés et énonce sa décision — absorber, réajuster, substituer', max: 5, mode: 'points' },
                ],
            },
            hygiene('1-B3', null),
        ],
    },

    {
        code: 'BC04', label: 'Organiser l\'approvisionnement et l\'équipement', points: 138,
        modalite: 'Étude de cas 2 h · mise en situation en réserve 1 h',
        competences: [
            {
                code: 'C4.1', label: 'Déterminer ses besoins', points: 12,
                criteres: [
                    { id: 'c41', label: 'Identifie et pèse les matières premières nécessaires, convertit en unités d\'achat réelles, marge de sécurité justifiée', max: 12, mode: 'points' },
                ],
            },
            {
                code: 'C4.2', label: 'Comparer et arbitrer', points: 38,
                criteres: [
                    { id: 'c42-zone', label: 'Étude de zone : concurrents, zone de chalandise, habitants, emplacement, accessibilité', max: 20, mode: 'points' },
                    { id: 'c42-four', label: 'Offres ramenées à une base comparable ; arbitrage argumenté qui ne retient pas systématiquement le prix le plus bas', max: 18, mode: 'points' },
                ],
            },
            {
                code: 'C4.3', label: 'Réceptionner et stocker', points: 44, elim: true,
                aide: 'Le jury introduit des non-conformités : température, date, emballage, quantité, étiquetage.',
                criteres: [
                    { id: 'c43-recep', label: 'Non-conformités détectées et consignées par écrit', mode: 'items', parItem: 4, items: ['Température', 'Date dépassée', 'Emballage', 'Quantité', 'Étiquetage'], paliers: [{ v: 4, l: 'Détectée et consignée' }, { v: 0, l: 'Manquée' }] },
                    { id: 'c43-stock', label: 'Stockage : lieux conformes, chaîne du froid, températures propres à chaque produit', max: 20, mode: 'points' },
                    { id: 'c43-bacs', label: 'Préparations réservées en bacs hermétiques individuels', max: 4, mode: 'palier', paliers: [{ v: 4, l: 'Conforme' }, { v: 0, l: 'Non conforme' }] },
                ],
            },
            {
                code: 'C4.4', label: 'Dimensionner l\'équipement', points: 20, nonCompensable: true,
                aide: 'Une napolitaine se cuit entre 400 et 485 °C : la température requise élimine des matériels avant tout budget.',
                criteres: [
                    { id: 'c44', label: 'Énonce la température requise en premier ; pétrin cohérent avec le volume ; deux contraintes d\'exploitation ; coût en investissement ET en exploitation', max: 20, mode: 'points' },
                ],
            },
            {
                code: 'C4.5', label: 'Utiliser les outils numériques d\'exploitation', points: 8, nonCompensable: true,
                criteres: [
                    { id: 'c45', label: 'Relevés et traçabilité complets et horodatés ; retrouve la traçabilité d\'un lot désigné par le jury', max: 8, mode: 'points' },
                ],
            },
            {
                code: 'C4.6', label: 'Entretien et maintenance', points: 8,
                criteres: [
                    { id: 'c46', label: 'Opérations d\'entretien et périodicité ; obligations propres à l\'énergie du four décrit — ramonage biannuel pour le bois', max: 8, mode: 'points' },
                ],
                elimNote: 'Aucune opération d\'entretien décrite sans consignation préalable de l\'énergie.',
            },
            {
                code: 'C4.7', label: 'Trier et valoriser les déchets', points: 8, nonCompensable: true,
                criteres: [
                    { id: 'c47', label: 'Tri à la source des biodéchets mis en œuvre ; flux séparés ; deux gisements d\'économie identifiés', max: 8, mode: 'points' },
                ],
                elimNote: 'Aucune huile usagée évacuée par le réseau d\'eaux usées.',
            },
        ],
    },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
   RÈGLES DE VALIDATION
   Le seuil de 70 % seul ne suffisait pas : un candidat pouvait obtenir ZÉRO sur « choisir
   une méthode », « sélectionner une farine » et « diagnostiquer un défaut » — 42 points sur
   182 — et valider BC01 malgré tout. Ce sont exactement les trois compétences qui
   distinguent ce titre du CQP de niveau 3. D'où le seuil individuel.
   ──────────────────────────────────────────────────────────────────────────────────────── */
export const SEUIL_BLOC = 0.70;
export const SEUIL_COMPETENCE = 0.50;   // sur les seules compétences non compensables

export const maxCritere = (c) =>
    c.mode === 'items' ? c.items.length * c.parItem : (c.max ?? 0);

export const maxCompetence = (comp) =>
    comp.criteres.reduce((s, c) => s + maxCritere(c), 0);

/** Total saisi pour une compétence. `scores` = { [critereId]: number | number[] } */
export function totalCompetence(comp, scores = {}) {
    return comp.criteres.reduce((sum, c) => {
        const v = scores[c.id];
        if (v == null) return sum;
        return sum + (Array.isArray(v) ? v.reduce((a, b) => a + (Number(b) || 0), 0) : Number(v) || 0);
    }, 0);
}

/**
 * Verdict d'un bloc. Retourne le détail, pas seulement un booléen : le jury doit voir
 * POURQUOI un bloc tombe — c'est ce qui rend la décision motivable au procès-verbal.
 */
export function verdictBloc(bloc, scores = {}, elims = {}) {
    const total = bloc.competences.reduce((s, c) => s + totalCompetence(c, scores), 0);
    const max = bloc.competences.reduce((s, c) => s + maxCompetence(c), 0);
    const seuil = Math.ceil(max * SEUIL_BLOC);

    const insuffisantes = bloc.competences
        .filter((c) => c.nonCompensable)
        .filter((c) => totalCompetence(c, scores) < maxCompetence(c) * SEUIL_COMPETENCE)
        .map((c) => c.code);

    const elimManques = bloc.competences
        .filter((c) => c.elim)
        .flatMap((c) => c.criteres)
        .filter((c) => elims[c.id] === false)
        .map((c) => c.label);

    return {
        total, max, seuil,
        seuilAtteint: total >= seuil,
        insuffisantes,
        elimManques,
        acquis: total >= seuil && insuffisantes.length === 0 && elimManques.length === 0,
    };
}

export const TOTAL_POINTS = BLOCS.reduce(
    (s, b) => s + b.competences.reduce((t, c) => t + maxCompetence(c), 0), 0);
