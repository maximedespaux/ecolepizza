/**
 * L'ESPACEMENT ENTRE SECTIONS — une classe qui porte son rythme ne doit pas être contredite.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, page par page, avant d'écrire ce fichier.
 *
 * L'application n'a pas UN espacement mais plusieurs, et c'est légitime : la distance qui suit un
 * en-tête de page n'est pas celle qui sépare deux sections, ni celle qui colle une barre d'outils
 * à ce qu'elle commande. Chaque relation a son rythme, porté par une CLASSE :
 *
 *     .pagehead → 30    .tabs → 18    .compteurs → 16    .todo-calme → 14    .recherche → 12
 *
 * LE DÉFAUT N'ÉTAIT DONC PAS LA VARIÉTÉ, mais la CONTRADICTION. `.tabs` valait 18 partout… sauf
 * sur `/modeles` et `/partenaires`, où un `style={{ marginBottom: 14 }}` en ligne l'écrasait. Le
 * même élément respirait différemment d'une page à l'autre, sans qu'aucune raison ne le
 * justifie — et le style en ligne l'emporte toujours, donc corriger la feuille de style n'y
 * aurait rien changé.
 *
 * ET UNE GRILLE NE POUSSE PAS CE QUI LA SUIT : `.grid` porte un `gap` ENTRE ses colonnes, pas
 * sous elle. Posée dans un empilement, elle se colle au bloc suivant — mesuré à 0 px sur le
 * tableau de bord, là où tout le reste de la page respirait de 16.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const CSS = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8');

/**
 * LES CLASSES QUI STRUCTURENT UNE PAGE, énumérées à la main — et la première version ne l'était
 * PAS : elle prenait toute classe portant une `margin-bottom` en CSS, et remontait CENT
 * contradictions… toutes légitimes. `.field`, `.eyebrow`, `.ate-lbl` vivent À L'INTÉRIEUR d'un
 * composant, où retirer la marge d'un champ en fin de rangée est un ajustement local normal.
 *
 * Un détecteur qui crie au loup cent fois se désactive au bout de deux. La liste est donc celle
 * des blocs qui SÉPARENT DES SECTIONS — ceux dont l'espacement se lit d'une page à l'autre, et
 * dont l'incohérence saute aux yeux. Y ajouter une classe est un geste conscient.
 */
const STRUCTURELLES = new Set([
    'pagehead', 'tabs', 'recherche', 'compteurs', 'todo', 'todo-calme', 'inv-group',
    'filtres', 'carte-dette', 'hero', 'grid',
]);

/** Les classes dont la feuille de style fixe elle-même la marge basse. */
function classesAvecRythme() {
    const out = new Map();
    for (const m of CSS.matchAll(/\.([a-z][a-z0-9-]*)\{([^}]*)\}/g)) {
        const mb = m[2].match(/margin-bottom:\s*(\d+)px/)
            || m[2].match(/margin:[^;]*?\s(\d+)px(?:\s*;|\s*$)/);   // raccourci `margin: 4px 0 18px`
        if (mb && STRUCTURELLES.has(m[1])) out.set(m[1], Number(mb[1]));
    }
    return out;
}

function pages() {
    const out = [];
    for (const dir of ['pages', 'components']) {
        const d = path.join(UI, dir);
        for (const f of fs.readdirSync(d)) if (f.endsWith('.jsx')) out.push([`${dir}/${f}`, fs.readFileSync(path.join(d, f), 'utf8')]);
    }
    return out;
}

test('le détecteur trouve bien les classes qui portent une marge', () => {
    /* Sans ce contrôle, une expression cassée rendrait une liste vide et le test suivant
       passerait au vert en ne vérifiant RIEN. */
    const c = classesAvecRythme();
    for (const [nom, attendu] of [['pagehead', 30], ['tabs', 18], ['recherche', 12], ['compteurs', 16]]) {
        assert.strictEqual(c.get(nom), attendu, `.${nom} doit être détectée à ${attendu}px`);
    }
});

test('aucune page ne contredit en ligne le rythme d\'une classe', () => {
    /* LE DÉFAUT EXACT : `<div className="tabs" style={{ marginBottom: 14 }}>` sur deux pages,
       alors que `.tabs` vaut 18. Le style en ligne gagne toujours — la feuille de style ne
       pouvait donc rien y faire, et l'écart ne se voyait qu'en mesurant page à page. */
    const rythmes = classesAvecRythme();
    const fautes = [];
    for (const [nom, src] of pages()) {
        for (const m of src.matchAll(/className="([a-z][a-z0-9- ]*)"\s+[^>]*?style=\{\{([^}]*)\}\}/g)) {
            /* DEUX ÉCRITURES POUR LA MÊME CHOSE, et la seconde m'avait échappé : `marginBottom: 14`
               ET le raccourci `margin: "0 0 14px"`. Le test ne cherchait que la première — la page
               d'une session écrasait donc `.tabs` à 14 depuis le début sans que rien ne le
               signale, exactement le défaut que j'avais corrigé ailleurs. Un détecteur qui ne
               connaît qu'une forme d'écriture ne détecte rien du tout. */
            const inline = m[2].match(/marginBottom:\s*(\d+)/)
                || m[2].match(/margin:\s*"[^"]*?\s(\d+)px"/);
            if (!inline) continue;
            for (const cl of m[1].split(/\s+/)) {
                const attendu = rythmes.get(cl);
                if (attendu !== undefined && attendu !== Number(inline[1])) {
                    fautes.push(`${nom} : .${cl} vaut ${attendu}px en CSS, écrasé à ${inline[1]}px en ligne`);
                }
            }
        }
    }
    assert.deepStrictEqual(fautes, [],
        'Un même élément doit respirer pareil sur toutes les pages ; sinon le rythme n\'en est '
        + 'plus un, et l\'écart ne se découvre qu\'en mesurant.');
});

test('une grille empilée pousse ce qui la suit', () => {
    /* `.grid` n'a qu'un `gap` — il joue ENTRE les colonnes, jamais sous la grille. Une grille
       posée au milieu d'un empilement se colle donc au bloc suivant : 0 px mesuré sur le tableau
       de bord, entre « Derniers dossiers » et « Partenaires ». */
    assert.match(CSS, /\.grid\{display:grid;gap:16px\}/,
        'Si `.grid` gagnait une marge basse, ce test et le correctif inline seraient à revoir.');
    const tdb = fs.readFileSync(path.join(UI, 'pages/Dashboard.jsx'), 'utf8');
    assert.match(tdb, /<div className="grid cols-2" style=\{\{ marginBottom: 16 \}\}>/,
        'La grille du tableau de bord doit espacer le bloc qui la suit.');
});
