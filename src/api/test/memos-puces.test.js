/**
 * LE MÉMO SUR PLUSIEURS LIGNES, ET SES PUCES (demandé le 2026-09-22, après la 177).
 *
 * L'école écrit ses pense-bêtes comme sur le papier :
 *
 *     Il faut faire :
 *     * appeler le fournisseur
 *     * préparer la session du 5
 *
 * CE QUE CES TESTS GÈLENT :
 *   · Maj + Entrée va à la ligne, Entrée AJOUTE le mémo — pas l'inverse : on ajoute vingt mémos
 *     pour une fois qu'on en rédige un long ;
 *   · une puce continue toute seule, et une puce laissée vide ferme la liste ;
 *   · les puces consécutives s'affichent en VRAIE liste, et le reste mot pour mot ;
 *   · le serveur garde les retours à la ligne — sans eux, la liste revient en une seule phrase.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const memosUi = () => import('../../app/ui/lib/memos.js');
const { lireNouveauMemo, MAX_TEXTE } = require('../lib/memos');

test('les puces qui se suivent forment UNE liste, le reste est gardé mot pour mot', async () => {
    const { blocsMemo } = await memosUi();
    assert.deepStrictEqual(blocsMemo('Il faut faire :\n* appeler\n* préparer'), [
        { type: 'texte', lignes: ['Il faut faire :'] },
        { type: 'puces', items: ['appeler', 'préparer'] },
    ], 'deux puces de suite = une seule liste, et la phrase qui les annonce reste du texte');

    /* DEUX LISTES SÉPARÉES PAR UNE PHRASE RESTENT DEUX LISTES : les fondre remonterait la seconde
       sous la première, et la phrase du milieu se retrouverait après ce qu'elle annonce. */
    const deux = blocsMemo('* un\nPuis :\n- deux');
    assert.deepStrictEqual(deux.map((b) => b.type), ['puces', 'texte', 'puces']);
    assert.deepStrictEqual(deux[2].items, ['deux'], '« - » est une puce autant que « * »');

    /* UNE ESPACE EST EXIGÉE APRÈS LA MARQUE, sinon « -5 °C au congélateur » deviendrait une puce
       et perdrait son signe moins. */
    assert.deepStrictEqual(blocsMemo('-5 °C au congélateur'),
        [{ type: 'texte', lignes: ['-5 °C au congélateur'] }]);

    /* Les lignes vides comptent : ce sont des respirations voulues, pas du vide à supprimer. */
    assert.deepStrictEqual(blocsMemo('Un\n\nDeux'), [{ type: 'texte', lignes: ['Un', '', 'Deux'] }]);
});

test('Maj + Entrée continue la puce, et une puce vide ferme la liste', async () => {
    const { continuerPuce } = await memosUi();

    /* SANS PUCE : une ligne de plus, rien d'autre. */
    assert.deepStrictEqual(continuerPuce('Il faut faire :', 15), { texte: 'Il faut faire :\n', curseur: 16 });

    /* DANS UNE PUCE : la marque est reposée toute seule — sinon il faudrait retaper « * » à chaque
       ligne, ce que personne ne fait deux fois. */
    assert.deepStrictEqual(continuerPuce('* appeler', 9), { texte: '* appeler\n* ', curseur: 12 });
    assert.deepStrictEqual(continuerPuce('  - appeler', 11), { texte: '  - appeler\n  - ', curseur: 16 },
        'la marque ET son retrait sont repris : une sous-liste reste alignée');

    /* PUCE VIDE : la liste se ferme, la marque s'efface, et la phrase suivante repart au bord.
       C'est le seul geste par lequel on en sort — sans lui, il faudrait effacer la marque à la
       main, deux retours en arrière que personne ne devine. */
    assert.deepStrictEqual(continuerPuce('* un\n* ', 7), { texte: '* un\n', curseur: 5 });

    /* AU MILIEU DU TEXTE, on coupe LÀ OÙ EST LE CURSEUR — pas à la fin du mémo : c'est ainsi qu'on
       sépare en deux une puce écrite trop vite. L'espace restée en bout de première ligne part à
       l'enregistrement (lib/memos.js, côté serveur). */
    assert.deepStrictEqual(continuerPuce('* un deux', 5), { texte: '* un \n* deux', curseur: 8 });
});

test('le mémo dit en une ligne perd ses marques, pas ses mots', async () => {
    const { resumeMemo } = await memosUi();
    assert.strictEqual(resumeMemo('Il faut faire :\n* appeler\n* préparer'), 'Il faut faire : appeler préparer');
    assert.strictEqual(resumeMemo('  Un   texte  '), 'Un texte');
});

test('Entrée ajoute, Maj + Entrée va à la ligne — et le téléphone garde sa touche Entrée', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoListe.jsx')));
    assert.match(src, /<textarea ref=\{champRef\}/, 'un pense-bête de trois lignes ne tient pas dans un `input`');
    assert.match(src, /if \(e\.shiftKey \|\| sansTouchMaj\(\)\) \{ e\.preventDefault\(\); allerALaLigne\(e\.target\); return; \}/,
        'Maj + Entrée va à la ligne');
    assert.match(src, /if \(e\.key !== "Enter" \|\| e\.isComposing\) return;\s*\n\s*if \(e\.shiftKey/,
        'Entrée au milieu d\'un caractère en composition n\'ajoute rien');
    assert.match(src, /matchMedia\?\.\("\(hover: none\)"\)/,
        'sur un téléphone, il n\'y a pas de Maj : Entrée doit y aller à la ligne');
    /* LA LISTE DES @ ET # GARDE LA PRIORITÉ : Entrée y choisit, elle n'envoie pas le mémo à moitié
       écrit. Cette ligne est aussi tenue par `memos-liens.test.js` — les deux disent la même chose,
       depuis les deux besoins qui l'exigent. */
    assert.match(src, /if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); choisir\(suggestions\[actif\]\); \}/);
    /* Et le champ grandit avec le texte, `height: auto` d'abord : sans quoi `scrollHeight` ne
       redescend jamais et le champ ne fait que grandir, même en effaçant. */
    assert.match(src, /el\.style\.height = "auto";/);
});

test('la liste affiche les puces comme une liste, pas comme des étoiles', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoListe.jsx')));
    assert.match(src, /blocsMemo\(m\.texte\)\.map/, 'le texte passe par le découpage en blocs');
    assert.match(src, /<ul key=\{i\} className="memo-puces">/, 'une vraie liste : un lecteur d\'écran l\'annonce');
    assert.doesNotMatch(src, /<span className="memo-texte">\{m\.texte\}<\/span>/,
        'le texte brut afficherait « Il faut faire : * un * deux » sur une seule ligne');
    /* Les libellés parlés prennent le mémo en UNE ligne, sans les marques. */
    assert.match(src, /const dit = resumeMemo\(m\.texte\);/);
    assert.doesNotMatch(src, /aria-label=\{`Supprimer : \$\{m\.texte\}`\}/);

    const css = lire(path.join(UI, 'styles/app.css'));
    assert.match(css, /\.memo-para\{margin:0;white-space:pre-wrap\}/,
        'les retours à la ligne comptent, et une ligne longue se replie quand même');
    assert.match(css, /\.memo-saisie\{resize:none/, 'la poignée du textarea déborderait du panneau');
});

test('le serveur garde les lignes du mémo, et borne les vides', () => {
    /* SANS CELA, LA LISTE REVIENT EN UNE SEULE PHRASE : c'est le serveur qui décide de ce qui est
       écrit, et un `replace(/\s+/g, " ")` de trop effacerait la mise en forme à l'enregistrement. */
    const r = lireNouveauMemo({ texte: 'Il faut faire :\r\n* appeler\r\n* préparer' });
    assert.strictEqual(r.valeurs.texte, 'Il faut faire :\n* appeler\n* préparer',
        'les fins de ligne de Windows sont ramenées à « \\n », et rien de plus');

    /* Les espaces en bout de ligne sont invisibles : ils feraient d'une puce vide (« * » suivi
       d'une espace) une ligne que rien ne distingue d'une puce écrite. */
    assert.strictEqual(lireNouveauMemo({ texte: 'un   \ndeux\t' }).valeurs.texte, 'un\ndeux');

    /* Vingt lignes vides pousseraient tout le reste de la liste hors de l'écran. */
    assert.strictEqual(lireNouveauMemo({ texte: 'un\n\n\n\n\ndeux' }).valeurs.texte, 'un\n\ndeux');

    /* La borne compte les retours comme le reste : ce sont des caractères de la colonne. */
    const trop = lireNouveauMemo({ texte: Array(MAX_TEXTE + 1).fill('a').join('\n') });
    assert.match(trop.erreur || '', /1000 caractères/);
});
