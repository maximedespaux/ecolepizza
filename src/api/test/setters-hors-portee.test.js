/**
 * UN SETTER D'ÉTAT APPELÉ HORS DE SON COMPOSANT — la panne muette.
 *
 * LE DÉFAUT, MESURÉ EN PRODUCTION le 2026-09-16. Le bouton « ＋ Ajouter une étape » de l'onglet
 * « À l'arrivée via une entreprise » appelait `setOuFor(null)` et `setChercheDoc("")` — deux
 * états de `ParcoursFlow`, un AUTRE composant de premier niveau. Le gestionnaire levait donc une
 * `ReferenceError` avant d'atteindre `setAdding` : le panneau ne s'ouvrait jamais. L'école en a
 * conclu qu'aucun document n'était disponible pour ce parcours — deux cent trois erreurs dans la
 * console d'un seul écran, et pas un mot à l'écran.
 *
 * POURQUOI RIEN NE L'A ATTRAPÉ. `esbuild` ne détecte pas les références non définies (CLAUDE.md
 * § 2.4), le build passe, et le composant se RENDAIT parfaitement — seul le clic échouait. Le
 * script `lint` du projet est mort : ESLint est installé, sans fichier de configuration.
 *
 * CE CONTRÔLE N'EST PAS UN LINTEUR, et n'essaie pas de l'être. Il ne regarde qu'une chose, très
 * reconnaissable : un identifiant `setXxx` APPELÉ dans une fonction de premier niveau qui ne le
 * déclare pas, ne le reçoit pas en paramètre et ne l'importe pas. C'est exactement la forme du
 * défaut ci-dessus, et la portée d'un état React est précisément ce qu'on oublie en déplaçant du
 * code d'un composant à l'autre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');

function jsx(dir = UI, base = '') {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...jsx(path.join(dir, e.name), rel));
        else if (e.name.endsWith('.jsx')) out.push(rel);
    }
    return out;
}

/** Les fonctions de premier niveau d'un fichier : [nom, paramètres, corps]. */
function fonctions(src) {
    const out = [];
    const re = /^(?:export default |export )?function ([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
    for (let m = re.exec(src); m; m = re.exec(src)) {
        let i = m.index + m[0].length - 1, prof = 0, deb = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') prof++;
            else if (src[i] === '}' && --prof === 0) break;
        }
        out.push([m[1], m[2], src.slice(deb, i)]);
    }
    return out;
}

test('aucun setter d\'état n\'est appelé hors du composant qui le déclare', () => {
    const fautifs = [];
    for (const rel of jsx()) {
        const src = fs.readFileSync(path.join(UI, rel), 'utf8');
        // Ce que le FICHIER importe ou déclare au niveau module.
        const connus = new Set();
        for (const m of src.matchAll(/import\s+\{([^}]*)\}/g)) {
            for (const x of m[1].split(',')) connus.add(x.trim().split(' as ').pop());
        }
        for (const m of src.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) connus.add(m[1]);

        for (const [nom, params, corps] of fonctions(src)) {
            const dec = new Set(connus);
            // Paramètres de la fonction, y compris déstructurés.
            for (const m of params.matchAll(/\b(set[A-Za-z_$][\w$]*)\b/g)) dec.add(m[1]);
            // `const [x, setX]`, `const { setX }`, `const setX = …`, et les paramètres des
            // fonctions fléchées internes — `(arr, setArr) => …` est une forme légitime.
            for (const m of corps.matchAll(/(?:const|let|var)\s*[[{]([^\]}]*)[\]}]/g)) {
                for (const n of m[1].matchAll(/\b(set[A-Za-z_$][\w$]*)\b/g)) dec.add(n[1]);
            }
            for (const m of corps.matchAll(/(?:const|let|function)\s+(set[A-Za-z_$][\w$]*)/g)) dec.add(m[1]);
            for (const m of corps.matchAll(/\(([^()]*)\)\s*=>/g)) {
                for (const n of m[1].matchAll(/\b(set[A-Za-z_$][\w$]*)\b/g)) dec.add(n[1]);
            }
            // Appel NU (pas `.setX(`, qui est une méthode).
            for (const m of corps.matchAll(/(^|[^.\w$])(set[A-Za-z_$][\w$]*)\s*\(/g)) {
                const u = m[2];
                if (dec.has(u) || u === 'setTimeout' || u === 'setInterval') continue;
                fautifs.push(`${rel} · ${nom}() appelle ${u}`);
            }
        }
    }
    assert.deepStrictEqual([...new Set(fautifs)], [],
        'un état React ne franchit pas la frontière d\'un composant : le clic lève une ReferenceError, '
        + 'le build passe, et rien ne s\'affiche.');
});
