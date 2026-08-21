/**
 * DEUX FOIS LE MÊME ATTRIBUT SUR UNE BALISE JSX — le dernier gagne, le premier disparaît.
 *
 * LE CAS RÉEL. `pages/Communaute.jsx` portait ceci sur l'avatar de la fiche profil :
 *
 *     <span className={...}
 *       style={cadreStyle(cadreProfil.valeur)}
 *       style={{ background: av ? av.color : "var(--surface2)" }}>
 *
 * JSX garde le DERNIER. `cadreStyle` était donc purement jeté — et avec lui la variable
 * `--cadre-c`, c'est-à-dire la couleur de la formation. Le cadre de quête s'affichait dans sa
 * teinte de repli au lieu de la sienne : très exactement ce que le commit qui a introduit cette
 * ligne (« des cadres gagnés en jouant, À LA COULEUR DE LA FORMATION ») était censé apporter.
 *
 * POURQUOI ÇA A SURVÉCU. Rien ne le signale : un anneau coloré autrement reste un anneau, la page
 * s'affiche, aucune erreur n'est levée. Vite émet bien un avertissement, mais dans le flot du
 * serveur de développement — et le BUILD, lui, passe au vert (cf. CLAUDE.md §2.4 : « le build qui
 * passe ne prouve RIEN »).
 *
 * Ce test relit toutes les balises ouvrantes de tous les .jsx et compte les attributs répétés.
 * Il coûte quelques millisecondes et il attrape une famille entière de bugs muets — `style` en
 * est le cas le plus coûteux, mais `className` deux fois efface la première liste de classes,
 * et `onClick` deux fois efface le premier gestionnaire.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');

/** Tous les .jsx du front, récursivement. */
function fichiers(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...fichiers(p));
        else if (e.name.endsWith('.jsx')) out.push(p);
    }
    return out;
}

test('aucune balise JSX ne répète un attribut', () => {
    const fautes = [];
    for (const f of fichiers(UI)) {
        const src = fs.readFileSync(f, 'utf8');
        /* On isole chaque balise OUVRANTE. Le `[^<>]` interdit d'avaler une balise imbriquée, et
           suffit ici : les attributs qui contiennent des chevrons sont dans des accolades, donc
           déjà écartés par la même contrainte — au prix de rater ces balises-là, ce qui est le bon
           compromis pour un test qui ne doit jamais crier à tort. */
        for (const m of src.matchAll(/<[A-Za-z][^<>]*?>/gs)) {
            const noms = [...m[0].matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9_:-]*)=/g)].map((a) => a[1]);
            const vus = new Set(), doubles = new Set();
            for (const n of noms) { if (vus.has(n)) doubles.add(n); vus.add(n); }
            if (doubles.size) {
                const ligne = src.slice(0, m.index).split('\n').length;
                fautes.push(`${path.relative(UI, f)}:${ligne} — ${[...doubles].join(', ')}`);
            }
        }
    }
    assert.deepStrictEqual(fautes, [],
        "Attribut répété : JSX ne garde que le dernier, le premier est perdu en silence.\n  "
        + fautes.join('\n  '));
});
