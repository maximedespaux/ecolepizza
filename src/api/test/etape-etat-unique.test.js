/**
 * « TERMINÉ » EN BAS, « MANQUANT » EN HAUT — le même écran, les mêmes données.
 *
 * LE DÉFAUT, MESURÉ EN PRODUCTION le 2026-09-15. Le bandeau « Ce qui manque » du suivi Qualiopi
 * réclamait QUATRE pièces d'identité et QUATRE justificatifs. Quinze pixels plus bas, le détail
 * du dossier affichait « Pièce d'identité — Terminé ». Relevé sur l'API : `status: "A_FAIRE"`,
 * `piece: true`, `pieceStatus: "VALIDEE"`.
 *
 * LA CAUSE : deux définitions de l'état d'une étape. `components/Roadmap.jsx` portait la
 * référence, `pages/Suivi.jsx` en gardait une copie annoncée « identique à Roadmap.stepState ».
 * Elle ne l'était plus — le cas des pièces avait été ajouté à l'une et pas à l'autre. Une
 * copie ne se signale jamais elle-même comme périmée ; c'est son commentaire qui ment en
 * premier.
 *
 * POURQUOI LE TEST QUI EXISTAIT N'A RIEN VU. `piece-depot-ecole-vaut-verification.test.js`
 * gelait bien la règle des pièces — en cherchant `if (doc.piece) {` DANS Roadmap.jsx. Il
 * prouvait donc que le correctif était appliqué là où il était appliqué. Un test qui vérifie un
 * motif dans UN fichier ne dit rien du fichier d'à côté qui fait le même travail.
 *
 * D'OÙ CE FICHIER, qui gèle deux choses que l'ancien ne pouvait pas gêler : le COMPORTEMENT de
 * la règle (elle est désormais dans une lib sans JSX, donc importable), et son UNICITÉ.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('UNE PIÈCE VALIDÉE EST TERMINÉE — le cas exact relevé en production', async () => {
    const { stepState } = await import('../../app/ui/lib/etapes.js');
    /* Les valeurs viennent de l'API de production, pas d'une invention : une pièce n'a jamais
       de document généré, donc son `status` reste « A_FAIRE » à vie. Lire ce champ-là pour
       juger une pièce, c'est la déclarer manquante pour toujours. */
    const piece = { label: "Pièce d'identité", status: 'A_FAIRE', piece: true, pieceStatus: 'VALIDEE' };
    assert.strictEqual(stepState(piece), 'done');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'DEPOSEE' }), 'progress', 'déposée, pas encore vérifiée');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'REFUSEE' }), 'todo', 'refusée : il y a bien à refaire');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'ATTENDUE' }), 'todo');
});

test('LES DOCUMENTS ORDINAIRES GARDENT LEUR RÈGLE', async () => {
    const { stepState } = await import('../../app/ui/lib/etapes.js');
    assert.strictEqual(stepState({ status: 'SIGNE' }), 'done');
    // Signable par le stagiaire : généré ou envoyé ne suffit pas, il manque la signature.
    assert.strictEqual(stepState({ status: 'ENVOYE', stagiaireSign: true }), 'progress');
    assert.strictEqual(stepState({ status: 'A_FAIRE', stagiaireSign: true }), 'todo');
    // Non signable : terminé dès qu'il existe.
    assert.strictEqual(stepState({ status: 'GENERE' }), 'done');
    assert.strictEqual(stepState({ status: 'A_FAIRE' }), 'todo');
});

test('IL N\'EXISTE QU\'UNE SEULE DÉFINITION DANS TOUT LE FRONT', () => {
    /* LE CŒUR DU SUJET. Corriger la copie sans la SUPPRIMER aurait remis le compteur à zéro en
       attendant la prochaine règle ajoutée d'un seul côté. On gèle donc l'unicité, pas la
       présence du correctif : la règle se reconnaît à sa liste de statuts, qui n'a aucune raison
       d'apparaître ailleurs. */
    const fichiers = [];
    const parcourir = (rel) => {
        for (const e of fs.readdirSync(path.join(UI, rel), { withFileTypes: true })) {
            const p = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) parcourir(p);
            else if (/\.(js|jsx)$/.test(e.name)) fichiers.push(p);
        }
    };
    parcourir('');
    const porteurs = fichiers.filter((f) => /\["GENERE", "ENVOYE", "CONSULTE"\]/.test(lire(f)));
    assert.deepStrictEqual(porteurs, ['lib/etapes.js'],
        'la règle d\'état ne doit vivre QU\'À UN endroit — toute copie finira par diverger.');
});

test('LA GRILLE DU SUIVI TIRE DE LA MÊME SOURCE', () => {
    /* Il y avait deux écrans : la feuille de route (components/Roadmap.jsx) et le suivi. La feuille
       de route est partie le 2026-09-24 avec les lignes qui la dépliaient, remplacée par la grille
       (lib/grilleSuivi.js) — qui dit désormais, seule, l'état d'une étape à l'écran du suivi. */
    assert.match(lire('lib/grilleSuivi.js'), /import \{[^}]*\bstepState\b[^}]*\} from ["']\.\/etapes\.js["']/,
        'la grille doit importer la règle, pas la réécrire');
    assert.match(lire('pages/Suivi.jsx'), /import \{[^}]*\betatCase\b[^}]*\} from ["']\.\.\/lib\/grilleSuivi\.js["']/,
        'la page lit l\'état d\'une case par la grille');
    assert.doesNotMatch(lire('pages/Suivi.jsx'), /function docState/,
        'la copie de Suivi.jsx est supprimée, pas seulement corrigée');
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   « CE QUI MANQUE » : DEUX CARTES IDENTIQUES, ET RIEN POUR LES DÉPARTAGER.

   RELEVÉ EN PRODUCTION le 2026-09-15, sur douze cartes : « Évaluation Formative du Mercredi »
   apparaissait DEUX FOIS — une à 4, une à 1 — et pareil pour le Jeudi et le Vendredi. Ce ne
   sont pas des doublons : chaque formation a son propre QCM, donc son propre `type`. Mais
   l'écran n'affichait que le libellé, et les deux formations portent le même.

   Le jeu d'essai ci-dessous reproduit la forme EXACTE des données de production, y compris le
   cas inverse : la feuille d'émargement, elle, est un seul `type` partagé par les deux
   formations — une carte unique ne pourrait donc porter aucune couleur juste. */
const DOSSIERS = [
    { program_code: 'RS7404', documents: [
        { type: 'quiz:merc-rs', label: 'Évaluation Formative du Mercredi', status: 'A_FAIRE' },
        { type: 'esheet-commune', label: "Feuille d'émargement", status: 'A_FAIRE' },
        { type: 'piece:id', label: "Pièce d'identité", status: 'A_FAIRE', piece: true, pieceStatus: 'VALIDEE' },
    ] },
    { program_code: 'RS7404', documents: [
        { type: 'quiz:merc-rs', label: 'Évaluation Formative du Mercredi', status: 'A_FAIRE' },
        { type: 'esheet-commune', label: "Feuille d'émargement", status: 'SIGNE' },
    ] },
    { program_code: 'NIV1H', documents: [
        { type: 'quiz:merc-niv1', label: 'Évaluation Formative du Mercredi', status: 'A_FAIRE' },
        { type: 'esheet-commune', label: "Feuille d'émargement", status: 'A_FAIRE' },
    ] },
];

test('DEUX FORMATIONS, DEUX CARTES — chacune la sienne', async () => {
    const { manquesParFormation } = await import('../../app/ui/lib/etapes.js');
    const cartes = manquesParFormation(DOSSIERS);
    const merc = cartes.filter((c) => c.label === 'Évaluation Formative du Mercredi');
    assert.strictEqual(merc.length, 2, 'le même libellé dans deux formations fait DEUX cartes');
    assert.deepStrictEqual(merc.map((c) => [c.code, c.n]).sort(), [['NIV1H', 1], ['RS7404', 2]]);
    /* CE QUI LES REND DÉPARTAGEABLES : chaque carte porte sa formation. Sans `code`, l'écran
       afficherait deux fois la même chose — le défaut d'origine. */
    assert.ok(merc.every((c) => c.code), 'chaque carte nomme sa formation');
});

test('UN TYPE PARTAGÉ SE DÉCOUPE AUSSI — sinon sa couleur serait un mensonge', async () => {
    const { manquesParFormation } = await import('../../app/ui/lib/etapes.js');
    const emarg = manquesParFormation(DOSSIERS).filter((c) => c.label === "Feuille d'émargement");
    assert.strictEqual(emarg.length, 2, 'un type commun aux deux formations donne deux cartes');
    assert.deepStrictEqual(emarg.map((c) => [c.code, c.n]).sort(), [['NIV1H', 1], ['RS7404', 1]],
        'et le dossier dont la feuille est SIGNÉE ne compte pas');
});

test('AUCUN LIBELLÉ N\'APPARAÎT DEUX FOIS À L\'IDENTIQUE', async () => {
    /* L'invariant qui résume tout : deux cartes peuvent porter le même libellé, jamais le même
       libellé ET la même formation. C'est exactement ce qui manquait à l'écran. */
    const { manquesParFormation } = await import('../../app/ui/lib/etapes.js');
    const vus = manquesParFormation(DOSSIERS).map((c) => `${c.label}|${c.code}`);
    assert.strictEqual(new Set(vus).size, vus.length);
});

test('UNE PIÈCE VALIDÉE NE FAIT PLUS DE CARTE', async () => {
    const { manquesParFormation } = await import('../../app/ui/lib/etapes.js');
    assert.ok(!manquesParFormation(DOSSIERS).some((c) => c.label === "Pièce d'identité"),
        'l\'agrégation passe par stepState : le correctif des pièces vaut aussi ici');
});

test('LE FILTRE AU CLIC VISE LE TYPE **ET** LA FORMATION', async () => {
    const { manquesParFormation, dossiersDuManque } = await import('../../app/ui/lib/etapes.js');
    const cartes = manquesParFormation(DOSSIERS);

    /* LE CAS QUI MET VRAIMENT LE FILTRE À L'ÉPREUVE : un type PARTAGÉ par les deux formations.
       Sur deux QCM distincts, retirer le contrôle de formation ne se voit pas — les types
       diffèrent, le filtre trie quand même. C'est la feuille d'émargement, un seul `type` pour
       tout le monde, qui révèle le défaut : sans la formation, cliquer la carte NIV1H ramène
       AUSSI le dossier RS7404. Un jeu d'essai qui ne contient que des types distincts laisse
       donc passer le bug — il m'a laissé passer une première fois. */
    const emargNiv1 = cartes.find((c) => c.code === 'NIV1H' && c.label === "Feuille d'émargement");
    const vusEmarg = dossiersDuManque(DOSSIERS, emargNiv1);
    assert.strictEqual(vusEmarg.length, 1, 'une seule formation visée, malgré un type commun');
    assert.strictEqual(vusEmarg[0].program_code, 'NIV1H');

    const cible = cartes.find((c) => c.code === 'NIV1H' && c.label.includes('Mercredi'));
    const vus = dossiersDuManque(DOSSIERS, cible);
    assert.strictEqual(vus.length, 1, 'un seul dossier NIV1H manque ce QCM');
    assert.strictEqual(vus[0].program_code, 'NIV1H');
    assert.strictEqual(dossiersDuManque(DOSSIERS, null).length, 3, 'sans filtre, tout revient');
});

test('LA TEINTE VIENT DE LA PALETTE PARTAGÉE, ET LA CSS LA SUIT PARTOUT', () => {
    /* Les cartes « Ce qui manque » sont devenues, le 2026-09-24, le pied des colonnes de la grille du
       suivi. La couleur d'une formation reste celle de `colorOf` — même palette que les badges et
       l'arbre des archives —, posée UNE fois sur sa table, en variable, et suivie partout où elle
       compte. (Le code de la formation, lui, s'affiche toujours : il n'est plus répété sur chaque
       carte, il TITRE la table.) */
    const suivi = lire('pages/Suivi.jsx');
    assert.match(suivi, /<section className="sg" style=\{\{ "--teinte": colorOf\(t\.code\) \}\}>/,
        'même palette que les badges de formation et l\'arbre des archives');
    const css = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8');
    const T = 'var\\(--teinte,var\\(--ember1\\)\\)';
    for (const [quoi, motif] of [
        ['le liseré de la table', `\\.sg-wrap\\{border-left:3px solid ${T}\\}`],
        ['le fond de la colonne choisie', `\\.sg-case\\.on,\\.sg-manque\\.on\\{background:color-mix\\(in srgb,${T} 12%`],
        ['le nom de la colonne choisie', `\\.sg-col\\.on \\.sg-col-btn\\{color:${T}`],
    ]) {
        assert.match(css, new RegExp(motif), `${quoi} doit suivre la teinte de la formation`);
    }
});
