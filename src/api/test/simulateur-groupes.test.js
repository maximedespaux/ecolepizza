/**
 * « TIPO 00 » S'ALLUMAIT QUAND ON POINTAIT « COMPLÈTE ».
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA CAUSE, ET ELLE N'ÉTAIT PAS DANS LE CSS. Les pastilles vivaient dans un `<label>` :
 *
 *     <label className="sim-ctrl">
 *       <span>Type de farine …</span>
 *       <div className="sim-pills">{TYPES.map(f => <button className="sim-pill">…</button>)}</div>
 *     </label>
 *
 * Un `<label>` sans `for` s'associe à son PREMIER DESCENDANT CONTRÔLABLE — et un `<button>` en
 * est un. Survoler n'importe où dans le bloc mettait donc la PREMIÈRE pastille en `:hover` : la
 * spécification le veut, aucune règle de style n'y pouvait quoi que ce soit. J'ai d'abord changé
 * deux fois la COULEUR du survol avant de regarder la structure.
 *
 * AU LECTEUR D'ÉCRAN, C'ÉTAIT PIRE : « Type de farine » était annoncé comme le NOM du premier
 * bouton, et les trois autres n'avaient plus d'intitulé de groupe du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE JE N'AI PAS PU FIGER, et pourquoi. Un balayage de l'application est ici sans valeur :
 * le défaut est une propriété du RENDU (N boutons sous un label), invisible dans le source où
 * `{TYPES.map(…)}` n'écrit qu'UN `<button>` littéral. Mon détecteur, éprouvé en réintroduisant
 * le défaut connu, ne l'a pas vu — et il signalait quatre autres blocs, tous sains (l'`<input>`
 * y vient en premier, le label le désigne correctement). Un instrument qui rate ce qu'il cherche
 * et crie sur le reste ne se livre pas.
 *
 * La vérification qui fait autorité est celle du DOM : `bouton.labels`, la réponse du navigateur
 * à « quel label me commande ? ». Mesurée à l'écran après correction : aucune pastille n'a plus
 * de label associé, et survoler « Complète » n'allume que « Complète ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui',
    'components', 'SimulateurPizza.jsx'), 'utf8');
/* Les commentaires citent `<label>` pour expliquer ce qu'on ne veut plus : sans ce nettoyage,
   les assertions ci-dessous trébucheraient sur leur propre documentation. */
const rendu = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('les groupes de pastilles ne sont pas des `<label>`', () => {
    const blocs = [...rendu.matchAll(/<(\w+)([^>]*)>\s*<span className="sim-ctrl-h"([^>]*)>([^<]*)/g)]
        .map((m) => ({ balise: m[1], attrs: m[2], titre: m[4].trim().slice(0, 20) }));
    assert.strictEqual(blocs.length, 4, 'les quatre réglages du simulateur doivent rester lisibles');

    /* SEULE LA FARINE RESTE UN GROUPE DE BOUTONS. Le four est passé au curseur — « Électrique
       340 / Gaz 400 / Bois 460 » donnait la réponse en trois valeurs, une par style. Son
       `<label>` est donc redevenu légitime, comme ceux du W et de l'hydratation. */
    const boutons = blocs.filter((b) => /Type de farine/.test(b.titre));
    for (const b of blocs) {
        const groupeDeBoutons = /Type de farine/.test(b.titre);
        if (!groupeDeBoutons) continue;
        assert.strictEqual(b.balise, 'div',
            `« ${b.titre} » enferme des boutons : un <label> associerait le PREMIER d'entre eux.`);
        assert.match(b.attrs, /role="group"/, 'Un groupe se nomme comme un groupe.');
        assert.match(b.attrs, /aria-labelledby="/, 'Et son intitulé pointe le titre, sans s\'attacher à un bouton.');
    }
    assert.strictEqual(boutons.length, 1, 'seule la farine reste un groupe de boutons');
});

test('les deux curseurs gardent leur `<label>`, qui est légitime', () => {
    /* Un `<label>` autour d'un curseur UNIQUE fait exactement ce qu'on attend : il le nomme, et
       cliquer le titre y donne le focus. Le retirer par symétrie aurait dégradé l'accessibilité
       en croyant l'améliorer. */
    for (const titre of ['Force de la farine', 'Hydratation', 'Four']) {
        const m = new RegExp(`<label className="sim-ctrl">\\s*<span className="sim-ctrl-h">${titre}`).exec(rendu);
        assert.ok(m, `« ${titre} » doit rester dans un <label> : il n'enveloppe qu'un curseur.`);
    }
});
