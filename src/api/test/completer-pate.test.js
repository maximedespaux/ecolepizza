/**
 * « COMPLÈTE LA PÂTE » — la fiche d'empâtement en grammes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL ENSEIGNE, ET QU'AUCUN AUTRE JEU DE L'ARCADE NE COUVRE.
 *
 * Le pourcentage boulanger porte TOUJOURS sur le poids de farine, jamais sur le poids total :
 * 2 % de sel sur 2 kg de farine font 40 g, quelle que soit l'eau. C'est l'erreur de débutant la
 * plus tenace, et elle ne se voit qu'en pesant.
 *
 * Et la levure se dose à DEUX entrées : la TEMPÉRATURE de la farine (plus elle est chaude, moins
 * on en met — manuel p.21) ET le TYPE. « Fraîche = sèche active ; sèche instantanée = moitié. »
 * Une conversion ratée double ou divise par deux la fermentation. C'est le seul ingrédient dont
 * la quantité ne dépend pas que du poids de farine.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * AUCUNE VALEUR N'EST INVENTÉE : `PRESETS` pour l'hydratation, le sel et l'huile, `LEVURE_TABLE`
 * pour la levure, `SUBSTITUTIONS` pour le bassinage. Tout vient de lib/dough.js, qui le tient
 * des manuels.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const jeu = fs.readFileSync(path.join(UI, 'components/CompleterPate.jsx'), 'utf8');
const dough = fs.readFileSync(path.join(UI, 'lib/dough.js'), 'utf8');
const quest = fs.readFileSync(path.join(UI, 'pages/PizzaQuest.jsx'), 'utf8');

/** La table de la levure, relue depuis lib/dough.js — jamais recopiée ici. */
function levureTable() {
    const bloc = /export const LEVURE_TABLE = \[([\s\S]*?)\n\];/.exec(dough);
    assert.ok(bloc, 'LEVURE_TABLE introuvable');
    return [...bloc[1].matchAll(/\{ tmax: (\d+), fraiche: ([\d.]+), seche_active: ([\d.]+), seche_instant: ([\d.]+) \}/g)]
        .map((m) => ({ tmax: +m[1], fraiche: +m[2], seche_active: +m[3], seche_instant: +m[4] }));
}

test('la règle du manuel tient : fraîche = sèche active, instantanée = moitié', () => {
    const t = levureTable();
    assert.ok(t.length >= 5, 'la table doit garder ses cinq tranches de température');
    for (const r of t) {
        assert.strictEqual(r.seche_active, r.fraiche,
            `à ${r.tmax} °C : la sèche active doit valoir la fraîche`);
        assert.strictEqual(r.seche_instant, r.fraiche / 2,
            `à ${r.tmax} °C : l'instantanée doit valoir la moitié de la fraîche`);
    }
    /* ET LA DOSE DÉCROÎT AVEC LA CHALEUR — c'est le sens même de la table : plus la farine est
       chaude, moins il en faut. Une table qui remonterait enseignerait l'inverse. */
    for (let i = 1; i < t.length; i++) {
        assert.ok(t[i].fraiche < t[i - 1].fraiche,
            `la dose doit décroître : ${t[i - 1].fraiche} → ${t[i].fraiche} à ${t[i].tmax} °C`);
    }
});

test('le jeu lit lib/dough.js, il ne recopie rien', () => {
    assert.match(jeu, /import \{ PRESETS, SUBSTITUTIONS, LEVURE_TYPES, LEVURE_TABLE, recoLevure, yeastLabel \} from "\.\.\/lib\/dough\.js"/,
        'toutes les données viennent de lib/dough.js');
    const rendu = jeu.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    /* Aucun pourcentage de levure en dur : une valeur dupliquée diverge le jour où le manuel est
       corrigé, et l'on enseignerait deux vérités selon l'écran. */
    assert.doesNotMatch(rendu, /fraiche:\s*[\d.]|seche_instant:\s*[\d.]/, 'aucune dose recopiée');
    assert.match(rendu, /recoLevure\(flourTemp, levType\.k\)/, 'la dose est demandée à la bibliothèque');
});

test('le pourcentage porte sur la FARINE, pas sur le poids total', () => {
    /* L'erreur que le jeu existe pour corriger : chaque réponse divise par 100 le poids de
       farine, jamais un total qui inclurait l'eau. */
    /* LA FORME EXACTE, et pas seulement la présence du mot « farine ». Ma première version
       exigeait que la ligne contienne `farine *` — un défaut écrit
       `((farine + farine * hydra / 100) * sel) / 100` la satisfaisait donc parfaitement, et le
       test restait VERT sur l'erreur qu'il existe pour interdire. Éprouvé en l'injectant. */
    const bloc = /reponses: \{([\s\S]*?)\n    \},/.exec(jeu);
    assert.ok(bloc, 'le bloc des réponses est introuvable');
    const lignes = bloc[1].split('\n').map((l) => l.trim()).filter((l) => /^\w+:/.test(l));
    assert.strictEqual(lignes.length, 4, 'quatre pesées attendues');
    for (const ligne of lignes) {
        /* `(farine * X) / 100`, et rien d'autre — sauf l'eau, qui ajoute le bassinage. */
        assert.match(ligne, /^\w+: \(farine \* [\w.]+\) \/ 100( \+ bassinage)?,$/,
            `« ${ligne} » : le pourcentage doit porter sur la farine SEULE.`);
    }
});

test('la farine est un multiple de 2 000 g, pour ne jamais dépasser une décimale', () => {
    /* Contrôle exhaustif fait avant d'écrire le jeu : sur 1 000 g, la sèche instantanée à
       0,175 % tombe sur 1,75 g — deux décimales, qu'on ne demande à personne de saisir. La
       levure se pèse au dixième, c'est le geste réel ; au centième, non. */
    assert.match(jeu, /const FARINES = \[2000, 4000, 6000\];/);
    const t = levureTable();
    for (const farine of [2000, 4000, 6000]) {
        for (const r of t) {
            for (const k of ['fraiche', 'seche_active', 'seche_instant']) {
                const g = (farine * r[k]) / 100;
                const dec = (String(g).split('.')[1] || '').length;
                assert.ok(dec <= 1, `${farine} g à ${r[k]} % → ${g} g, ${dec} décimales`);
            }
        }
    }
});

test('la table de la levure est montrée, et la bonne ligne mise en avant', () => {
    /* Ce n'est pas de la triche : on ne demande pas de retenir cinq lignes par cœur, on demande
       de savoir LIRE la bonne — et de ne pas oublier que l'instantanée vaut la moitié. En labo,
       la fiche est affichée au mur. */
    assert.match(jeu, /className="pate-table"/, 'la table doit être consultable');
    assert.match(jeu, /p\.flourTemp <= r\.tmax/, 'la ligne de la fiche doit être repérable');
});

test('le jeu est branché à l\'arcade et compte ses étoiles', () => {
    assert.match(quest, /import CompleterPate from "\.\.\/components\/CompleterPate\.jsx"/);
    assert.match(quest, /const GAME_PATE = \{ key: "pate"/);
    assert.match(quest, /ARCADE = \[[^\]]*GAME_PATE/);
    assert.match(quest, /mini\?\.key === "pate" && <CompleterPate[\s\S]{0,120}?finishMini\("pate", stars\)/);
});

test('la dernière fiche ne sort pas du tableau', () => {
    assert.match(jeu, /partie\[Math\.min\(manche, MANCHES - 1\)\]/,
        'le dépassement faisait disparaître l\'écran de fin dans les jeux voisins');
});
