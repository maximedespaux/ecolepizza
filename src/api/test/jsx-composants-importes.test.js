/**
 * TOUT COMPOSANT UTILISÉ EN JSX DOIT ÊTRE IMPORTÉ OU DÉFINI.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST EXISTE : `npm run build` NE LE VOIT PAS. C'est écrit noir sur blanc dans
 * CLAUDE.md § 2.4 — « esbuild ne détecte pas les références non définies » — et ça vient d'être
 * payé une fois de plus.
 *
 * LE DÉFAUT VÉCU : `<ImagePlaceholder>` a été utilisé DEUX FOIS dans `pages/Inventaire.jsx` alors
 * que seul `ImageLien` était importé. Le build est passé, sans un mot. À l'exécution, React
 * rencontre une référence indéfinie et fait tomber TOUT le composant `<Inventaire>` : le bouton
 * « Modifier l'article » ouvrait une modale VIDE, et le formulaire « Nouvel article » plantait
 * pareil. Une page entière hors service pour un mot manquant dans une ligne d'import.
 *
 * C'est le pire genre de défaut : invisible à la compilation, muet dans les journaux du serveur,
 * et il ne se manifeste que sur le chemin qu'on n'a pas rouvert après la modification.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * L'INSTRUMENT EST VALIDÉ AVANT D'ÊTRE CRU, et ce n'est pas une coquetterie : une première
 * version de ce balayage lisait mal `import A, { B } from` et rendait QUATRE faux positifs pour un
 * vrai défaut. Un détecteur qui crie au loup se désactive au bout de deux fois. Les contrôles
 * ci-dessous vérifient donc le détecteur lui-même, sur des cas dont on connaît la réponse, avant
 * de le lâcher sur le code.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');

/** Les composants JSX utilisés dans un fichier sans y être importés ni définis. */
function composantsManquants(src) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const utilises = new Set([...code.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map((m) => m[1]));
    const connus = new Set();

    // `import X from`, `import X, { A, B } from`, `import { A, B as C } from` (multilignes compris)
    for (const m of code.matchAll(/import\s+([^;]+?)\s+from/g)) {
        const clause = m[1];
        if (!clause.trim().startsWith('{')) {
            const defaut = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
            if (defaut) connus.add(defaut[1]);
        }
        for (const bloc of clause.matchAll(/\{([^}]*)\}/g)) {
            for (const n of bloc[1].split(',')) {
                const nom = n.trim();
                if (nom) connus.add(nom.split(' as ').pop().trim());
            }
        }
    }
    for (const m of code.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) connus.add(m[1]);
    for (const m of code.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) connus.add(m[1]);
    /* PARAMÈTRES DÉSTRUCTURÉS AVEC RENOMMAGE : `function Card({ as: Titre = "h2" })` rend `<Titre>`
       parfaitement licite — c'est un composant dynamique passé en prop. Sans cette ligne, `Card`
       remonterait comme une faute à chaque exécution, et le test finirait par être ignoré. */
    for (const m of code.matchAll(/[:,{]\s*([A-Z][\w$]*)\s*(?:=|[,}])/g)) connus.add(m[1]);

    return [...utilises].filter((u) => !connus.has(u) && !u.includes('.')).sort();
}

test("le détecteur lui-même est juste", () => {
    /* Sans ces contrôles, un détecteur cassé rendrait « aucun problème » et on le croirait — le
       test passerait au vert en ne vérifiant rien du tout. */
    const cas = [
        ['défaut seul', 'import A from "x";\n<A />', []],
        ['défaut + nommé', 'import A, { B } from "x";\n<A /><B />', []],
        ['nommé MANQUANT', 'import A from "x";\n<A /><B />', ['B']],
        ['alias', 'import { C as D } from "x";\n<D />', []],
        ['défini localement', 'function E() {}\n<E />', []],
        ['const fléchée', 'const F = () => null;\n<F />', []],
        ['import multiligne', 'import A, {\n  B,\n  C,\n} from "x";\n<B /><C />', []],
        ['prop renommée avec défaut', 'function G({ as: H = "h2" }) { return <H /> }', []],
        ['dans un commentaire seulement', '/* <Fantome /> */\nimport A from "x";\n<A />', []],
    ];
    for (const [nom, src, attendu] of cas) {
        assert.deepStrictEqual(composantsManquants(src), attendu, `contrôle « ${nom} »`);
    }
});

test('aucun composant JSX utilisé sans être importé ni défini', () => {
    const fautes = [];
    (function parcourir(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) parcourir(p);
            else if (e.name.endsWith('.jsx')) {
                for (const c of composantsManquants(fs.readFileSync(p, 'utf8'))) {
                    fautes.push(`${path.relative(UI, p)} : <${c}>`);
                }
            }
        }
    })(UI);
    assert.deepStrictEqual(fautes, [],
        'Une référence indéfinie fait tomber TOUT le composant à l\'exécution, sans que le build '
        + 'dise quoi que ce soit (cf. CLAUDE.md § 2.4).');
});
