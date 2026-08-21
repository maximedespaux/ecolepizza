/**
 * « LA SUBSTITUTION » — le calcul de la fiche technique, en jeu.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * IL NE FAUT INVENTER AUCUNE VALEUR, et c'est la seule chose qui compte sur ce fichier. Les
 * compléments de bassinage viennent de `SUBSTITUTIONS` (lib/dough.js), qui les tient du manuel
 * p.32 — soja et semi-complète +30 g pour 10 %, complète +40 g, maïs +20 g. Le jeu TIRE un
 * énoncé et vérifie une arithmétique ; il ne décide de rien.
 *
 * L'EXEMPLE DU MANUEL SERT DE TÉMOIN : « W330 avec 10 % de soja : 900 g de blé + 100 g de soja.
 * Eau = 570 g de coulage (57 %) + 30 g de bassinage = 600 g au total. Si tu mets de la farine
 * complète à la place du soja, elle boit plus : +40 g au lieu de +30 → 610 g. » Le test le
 * rejoue : si la formule dérive, il tombe.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET LES ÉNONCÉS DOIVENT RESTER DES PÂTES POSSIBLES. Chaque farine a un plafond conseillé
 * (`max` : soja 20 %, seigle 30 %…). Tirer 40 % de soja donnerait un calcul juste sur une pâte
 * qui n'existe pas : on entraînerait à calculer une faute professionnelle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const jeu = fs.readFileSync(path.join(UI, 'components/Substitutions.jsx'), 'utf8');
const dough = fs.readFileSync(path.join(UI, 'lib/dough.js'), 'utf8');
const quest = fs.readFileSync(path.join(UI, 'pages/PizzaQuest.jsx'), 'utf8');

/** Les farines du manuel, relues depuis lib/dough.js — jamais recopiées ici. */
function substitutions() {
    const bloc = /export const SUBSTITUTIONS = \[([\s\S]*?)\n\];/.exec(dough);
    assert.ok(bloc, 'SUBSTITUTIONS introuvable');
    return [...bloc[1].matchAll(/\{ key: "(\w+)", label: "([^"]+)", bass10: (\d+), max: (\d+)(, wheat: true)? \}/g)]
        .map((m) => ({ key: m[1], label: m[2], bass10: +m[3], max: +m[4], wheat: !!m[5] }));
}

test('l\'exemple du manuel se rejoue au gramme près', () => {
    const par = Object.fromEntries(substitutions().map((f) => [f.key, f]));
    const calc = (cle, pct, farine, hydra) => {
        const sub = (farine * pct) / 100;
        return { ble: farine - sub, sub, coulage: (farine * hydra) / 100,
            bassinage: par[cle].bass10 * (pct / 10) * (farine / 1000) };
    };
    /* « 900 g de blé + 100 g de soja. Eau = 570 de coulage + 30 de bassinage = 600. » */
    assert.deepStrictEqual(calc('soja', 10, 1000, 57), { ble: 900, sub: 100, coulage: 570, bassinage: 30 });
    /* « Si tu mets de la farine complète à la place du soja : +40 au lieu de +30 → 610. » */
    assert.strictEqual(calc('ble2', 10, 1000, 57).bassinage, 40);
});

test('le jeu lit les valeurs du manuel, il ne les recopie pas', () => {
    assert.match(jeu, /import \{ SUBSTITUTIONS \} from "\.\.\/lib\/dough\.js"/,
        'les compléments de bassinage doivent venir de lib/dough.js');
    /* Aucun nombre de bassinage écrit en dur : une valeur recopiée diverge le jour où le manuel
       est corrigé, et l'on enseignerait deux vérités selon l'écran. */
    const rendu = jeu.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.doesNotMatch(rendu, /bass10:\s*\d/, 'aucun complément de bassinage en dur');
});

test('aucun énoncé ne dépasse le plafond conseillé de sa farine', () => {
    /* `Math.min(f.max, 30)` : le plafond de la farine, et jamais plus de 30 % — au-delà, même
       autorisé (les blés montent à 50), l'énoncé cesse d'être une pâte à pizza courante. */
    assert.match(jeu, /const plafond = Math\.min\(f\.max, 30\);/, 'le plafond doit borner le tirage');
    assert.match(jeu, /const pct = 5 \* \(1 \+ alea\(plafond \/ 5\)\);/, 'et le tirage doit s\'y tenir');
    /* Simulation exhaustive : tout tirage possible reste sous le plafond ET tombe sur un entier. */
    for (const f of substitutions().filter((x) => !x.wheat)) {
        const plafond = Math.min(f.max, 30);
        for (let k = 1; k <= plafond / 5; k++) {
            const pct = 5 * k;
            assert.ok(pct <= f.max, `${f.label} : ${pct} % dépasse son plafond de ${f.max} %`);
            for (const farine of [1000, 2000, 3000]) {
                const bass = f.bass10 * (pct / 10) * (farine / 1000);
                assert.ok(Number.isInteger(bass), `${f.label} ${pct}% sur ${farine}g → ${bass} g, décimal`);
            }
        }
    }
});

test('les farines de blé sont écartées des énoncés', () => {
    /* « 850 g de blé + 150 g de blé » embrouille au lieu d'enseigner. */
    assert.match(jeu, /SUBSTITUTIONS\.filter\(\(f\) => !f\.wheat\)/);
});

test('le jeu est branché à l\'arcade et compte ses étoiles', () => {
    assert.match(quest, /import Substitutions from "\.\.\/components\/Substitutions\.jsx"/);
    assert.match(quest, /const GAME_SUBS = \{ key: "substitutions"/);
    assert.match(quest, /ARCADE = \[[^\]]*GAME_SUBS/);
    assert.match(quest, /mini\?\.key === "substitutions" && <Substitutions[\s\S]{0,120}?finishMini\("substitutions", stars\)/);
});

test('la dernière manche ne sort pas du tableau', () => {
    /* Le piège déjà rencontré dans « Fais ta pizza » : après la cinquième, l'index vaut 5 et
       `partie[5]` n'existe pas — la modale disparaissait au lieu d'afficher le résultat. */
    assert.match(jeu, /partie\[Math\.min\(manche, MANCHES - 1\)\]/);
});
