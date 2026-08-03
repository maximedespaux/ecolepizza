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

test('des cartes empilées dans un même conteneur sont espacées', () => {
    /* ─────────────────────────────────────────────────────────────────────────────────────────
       LE DÉFAUT SIGNALÉ, et il échappait à tous les contrôles précédents.

       Trois composants partageaient un seul `<div style={{ marginTop: 16 }}>` sur la page d'une
       session. La marge s'appliquait donc AVANT LE GROUPE, et les cartes à l'intérieur se
       touchaient : 0 px mesuré entre « Transmission aux partenaires » et « Intervenants
       externes ».
       Le contrôle du rythme ne pouvait pas le voir — il compare les blocs de PREMIER NIVEAU, et
       ces trois cartes n'en forment qu'un.

       ET LE DÉFAUT ÉTAIT LATENT AVANT L'AJOUT DE LA CARTE DE TRANSMISSION : `SessionRetraits`
       rend `null` quand aucun retrait n'est réservé, si bien qu'il n'y avait le plus souvent
       qu'une seule carte dans ce conteneur — rien ne pouvait s'y coller. Une troisième l'a
       révélé. */
    const page = fs.readFileSync(path.join(UI, 'pages/SessionDetail.jsx'), 'utf8');
    const d = page.indexOf('<SessionConsentements');
    const ouverture = page.lastIndexOf('<div style={{', d);
    const conteneur = page.slice(ouverture, d);
    assert.match(conteneur, /display: "flex", flexDirection: "column", gap: 16/,
        'Un conteneur qui empile plusieurs cartes doit porter un `gap`, pas seulement une marge '
        + 'haute : la marge espace le GROUPE, jamais ce qu\'il contient.');
    /* Un enfant qui rend `null` ne crée aucun espace fantôme : le `gap` n'agit qu'entre les
       éléments réellement rendus. C'est ce qui rend cette forme sûre malgré `SessionRetraits`. */
    assert.match(page, /<SessionRetraits/);
    assert.match(page, /<SessionIntervenants/);
});

test("la page d'une session n'offre plus d'export", () => {
    /* « Produire la liste pour un partenaire » ne parlait à personne, et l'école a préféré le
       retirer plutôt que de le reformuler : cette carte a UN sujet, le suivi des consentements —
       qui a accepté, qui a refusé, qui n'a jamais été sollicité. L'envoi se décide ailleurs, sur
       la fiche du partenaire à qui l'on écrit. */
    const comp = fs.readFileSync(path.join(UI, 'components/SessionConsentements.jsx'), 'utf8');
    assert.doesNotMatch(comp, /Préparer l'envoi|Produire la liste|consent-envoi/,
        "La carte de session ne doit plus proposer d'export.");
    assert.doesNotMatch(comp, /getPartenaires|produireTransmission/,
        'Ni charger la liste des partenaires, dont elle n\'a plus l\'usage.');
    /* ET CE QU'ELLE GARDE : le suivi, qui est son sujet. */
    assert.match(comp, /Jamais sollicité/);

    /* L'AVERTISSEMENT A SUIVI L'EXPORT. Il reste nécessaire là où il vit désormais : « Produire »
       à côté d'une icône de téléchargement pourrait laisser croire à un envoi automatique. */
    const exp = fs.readFileSync(path.join(UI, 'components/ExportPartenaire.jsx'), 'utf8');
    assert.match(exp, /n'envoie rien elle-même/);
    assert.match(exp, /même si vous ne\s*\n?\s*l'envoyez pas ensuite/);
});


test('un tableau large défile au lieu de pousser la page', () => {
    /* LE PIÈGE CLASSIQUE DU FLEX, et il annule silencieusement un `overflow-x:auto` : un élément
       flex vaut `min-width:auto` par défaut, c'est-à-dire « au moins la largeur de mon contenu ».
       Le conteneur de tableau ne peut découper que ce qui dépasse d'un parent BORNÉ — sans
       `min-width:0`, il n'y a rien à découper, le parent ayant grandi avec lui.
       Mesuré : un enfant de 3000 px étirait le bloc à 3024 px et faisait déborder la page ; avec
       la règle, le bloc reste à 892 px et le tableau défile en interne. */
    assert.match(CSS, /\.filtres \.export-part\{[^}]*min-width:0/,
        'Sans `min-width:0`, le `overflow-x:auto` du tableau ne sert à rien.');
    assert.match(CSS, /\.consent-table-wrap\{overflow-x:auto\}/,
        'Et le conteneur doit bien porter le défilement.');
});

test("une date n'est pas un montant : elle ne doit pas être masquée", () => {
    /* `.tnum` FAIT DEUX CHOSES À LA FOIS : la fonte à chiffres alignés, ET le marqueur « c'est de
       l'argent, masque-le » (`.money-mask .tnum::after` remplace le contenu par « ••••• »). Les
       deux rôles n'ont rien à voir, et la confusion se paie : la date du journal des
       transmissions disparaissait derrière des points dès que l'utilisateur masquait les
       montants — signalé par l'école.
       Cacher une date de transmission ne protège rien, et rend le journal illisible au moment
       précis où l'on en a besoin. D'où `.chiffres`, qui ne porte que la typographie. */
    assert.match(CSS, /\.chiffres\{font-variant-numeric:tabular-nums\}/,
        'Une classe de chiffres alignés SANS le masque doit exister.');
    assert.match(CSS, /\.money-mask \.tnum::after/, 'et `.tnum` garder son rôle de masque');

    const comp = fs.readFileSync(path.join(UI, 'components/ExportPartenaire.jsx'), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.match(comp, /className="chiffres hint">\{j\.sent_at\}/,
        'La date du journal doit utiliser `.chiffres`…');
    assert.doesNotMatch(comp, /className="tnum hint">\{j\.sent_at\}/, '…et non `.tnum`.');
});
