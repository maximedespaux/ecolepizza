/**
 * LES DEUX ÉCRANS DE L'ÉVALUATION PRATIQUE — ce qui, en les rangeant, casserait la
 * fonctionnalité sans rien casser de visible.
 *
 * Tests de SOURCE : ce qu'ils gèlent ne sont pas des calculs mais des DÉCISIONS de montage,
 * qu'un nettoyage bien intentionné défait volontiers. Chacune a une raison écrite à côté.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const SESSION = lire('pages/SessionDetail.jsx');
const SAISIE = lire('components/SessionEvaluation.jsx');
const GRILLE = lire('components/GrilleEvaluation.jsx');
const FORMATIONS = lire('pages/Formations.jsx');

test('LE FORMATEUR VOIT LA SAISIE — la carte n\'est pas réservée au bureau', () => {
    /* LE DÉFAUT LE PLUS FACILE À RÉINTRODUIRE. Trois blocs voisins de cette page sont montés
       sous `isAdmin` (consentements, formateurs, intervenants), et `isAdmin` EXCLUT le rôle
       FORMATEUR. Aligner celui-ci sur ses voisins « pour faire propre » retirerait l'écran de
       notation à la seule personne qui note. Le serveur décide seul du droit d'écrire (STAFF). */
    const i = SESSION.indexOf('<SessionEvaluation');
    assert.ok(i > 0, 'la carte d\'évaluation doit être montée sur la page de la session');
    const avant = SESSION.slice(Math.max(0, i - 400), i);
    assert.doesNotMatch(avant, /isAdmin\s*&&\s*[^}]*$/,
        'la saisie des notes ne doit pas être conditionnée à isAdmin — le formateur en est exclu');
});

test('LA SAISIE ENVOIE LA MESURE, jamais des points', () => {
    /* La règle qui porte toute la fonctionnalité, vue du navigateur : c'est le serveur qui
       applique le barème. Un écran qui enverrait ses propres points ferait de la grille une
       suggestion — et le serveur, qui les ignore, laisserait la divergence invisible. */
    const m = /saveNoteEvaluation\(\{([^}]*)\}\)/.exec(SAISIE);
    assert.ok(m, 'l\'écran doit enregistrer par saveNoteEvaluation');
    assert.match(m[1], /valeur/);
    assert.doesNotMatch(m[1], /points/, 'les points ne se transmettent pas, ils se calculent');
});

test('LES TOTAUX SONT RELUS DU SERVEUR après chaque note, pas recalculés à l\'écran', () => {
    /* Une seconde implémentation du barème dans le navigateur finirait par diverger de la
       vraie — et c'est l'écran qu'on croirait. C'est le défaut déjà payé sur `computeDocParcours`,
       recopié dans quatre fichiers qui s'étaient tous mis à dire autre chose. */
    assert.match(SAISIE, /await saveNoteEvaluation\([\s\S]{0,300}?await charger\(true\)/,
        'chaque enregistrement doit être suivi d\'une relecture');
    for (const nom of ['pointsPour', 'totalGrille', 'reussite(']) {
        assert.ok(!SAISIE.includes(nom), `${nom} : le barème ne se réimplémente pas côté écran`);
    }
});

test('la relecture ne fait pas clignoter la barre de chargement', () => {
    /* Le formateur saisit en rafale : une barre de chargement par note transformerait l'écran
       en stroboscope. `silent` existe déjà pour les relectures de fond. */
    assert.match(lire('api/apiClient.js'), /getEvaluationSession\(sessionId, silent\)/);
    assert.match(SAISIE, /charger\(true\)/);
});

test('UN EXERCICE DÉSACTIVÉ NE REMONTE PAS DANS L\'ÉDITEUR — sinon l\'enregistrer le ressuscite', () => {
    /* Le serveur réactive tout exercice présent dans l'envoi (`active = 1`). Afficher les
       exercices retirés les renverrait tels quels au premier enregistrement : un exercice
       qu'on croyait sorti de la grille se remettrait à compter dans les totaux. */
    /* CHAQUE lecture de la réponse du serveur est vérifiée, pas seulement la première : il y en
       a deux (au chargement et après enregistrement), et n'en contrôler qu'une laisserait
       l'autre casser en silence — c'est ce qui vient d'arriver en éprouvant ce test. */
    const lectures = [...GRILLE.matchAll(/\(g\.exercices \|\| \[\]\)(\.[a-zA-Z]+)/g)];
    assert.ok(lectures.length >= 2, 'le serveur renvoie la grille au chargement ET après enregistrement');
    for (const m of lectures) {
        assert.strictEqual(m[1], '.filter',
            'toute lecture de la grille renvoyée doit d\'abord écarter les exercices désactivés');
    }
    assert.ok(GRILLE.split('(g.exercices || []).filter((e) => e.active)').length - 1 === lectures.length);
});

test('l\'éditeur REPREND les identifiants renvoyés par le serveur', () => {
    /* Sans cela, un deuxième « Enregistrer » recréerait les exercices tout juste créés au lieu
       de les mettre à jour : la grille doublerait, et les notes du premier jeu deviendraient
       orphelines d'une grille active. */
    const i = GRILLE.indexOf('async function enregistrer');
    const corps = GRILLE.slice(i, GRILLE.indexOf('\n  }', i));
    assert.match(corps, /setExercices\(/, 'la réponse du serveur doit remplacer l\'état local');
});

test('la grille se configure DANS LA FORMATION, et seulement sur une formation existante', () => {
    /* Elle est propre à la formation — on ne note pas un CAP hygiène comme un perfectionnement
       au four à bois. Et une formation pas encore créée n'a pas d'identifiant : l'onglet
       ouvrirait sur une grille qui ne pourrait jamais s'enregistrer. */
    assert.match(FORMATIONS, /tab === "evaluation" && !isNew/);
    assert.match(FORMATIONS, /<GrilleEvaluation programId=\{program\.id\}/);
});

test('la rangée d\'onglets défile DANS SON CADRE, pas en poussant la page', () => {
    /* Une grille peut compter dix exercices et des noms de stagiaires sont longs : sans cadre
       propre, c'est la PAGE qui prendrait une barre de défilement latérale. */
    assert.match(lire('styles/app.css'), /\.eval-onglets\{[^}]*overflow-x:auto/);
    assert.match(SAISIE, /className="eval-onglets"/);
});

/* ---------------------------------------------------------------------------------------- */

test('une durée se relit comme elle a été TAPÉE, et un aller-retour ne la déforme pas', async () => {
    /* DEUX DÉFAUTS TROUVÉS EN RELISANT L'ÉCRAN, que ni le build ni le rendu n'auraient
       signalés. La base stocke des SECONDES ; le formateur, lui, tape « 1:40 ». Réafficher
       « 100 » au rechargement lui fait relire sa propre saisie dans une autre unité — et
       douter de ce qu'il a noté. */
    const { lireDuree, dureeSaisissable } = await import('../../app/ui/lib/format.js');
    for (const [saisi, secondes] of [['1:40', 100], ["1'30", 90], ['1m05', 65], ['45', 45], ['2:00', 120], ['10:00', 600]]) {
        assert.strictEqual(lireDuree(saisi), secondes, `« ${saisi} »`);
    }
    for (const s of [0, 45, 59, 60, 65, 100, 120, 599, 600, 3601]) {
        assert.strictEqual(lireDuree(dureeSaisissable(s)), s, `aller-retour sur ${s} s`);
    }
    assert.strictEqual(dureeSaisissable(100), '1:40');
    assert.strictEqual(dureeSaisissable(45), '45', 'sous la minute, le nombre nu se retape tel quel');
    assert.strictEqual(dureeSaisissable(''), '');
});

test('ON NE DEVINE PAS une durée incompréhensible', () => {
    /* Noter un examen sur une durée mal interprétée est pire que ne pas la noter. `null` fait
       afficher « durée illisible » et n'enregistre rien. */
    return import('../../app/ui/lib/format.js').then(({ lireDuree }) => {
        for (const mauvais of ['', '  ', 'abc', '1:2:3', 'une minute', '-30', '1,5']) {
            assert.strictEqual(lireDuree(mauvais), null, `« ${mauvais} » ne doit pas se deviner`);
        }
    });
});

test('LE CHOIX NE SAUTE PAS À CHAQUE NOTE', () => {
    /* Trouvé en relisant : les totaux sont relus du serveur après chaque saisie, donc l'effet
       qui choisit un exercice par défaut se rejoue à CHAQUE note. Sans garde, le formateur
       revenait au premier exercice dès qu'il en notait un autre — un clic de plus entre chaque
       stagiaire, sur l'écran dont c'est l'unique fonction. */
    const SAISIE2 = fs.readFileSync(path.join(UI, 'components/SessionEvaluation.jsx'), 'utf8');
    assert.match(SAISIE2, /if \(!ids\.includes\(choisi\)\) setChoisi\(/,
        'le défaut ne doit être posé que si le choix courant n\'existe plus');
});

test('les conversions de durée vivent DANS format.js, pas recopiées dans l\'écran', () => {
    /* Elles sont partagées par l'éditeur de grille et l'écran de saisie. Deux copies d'une
       conversion finiraient par ne plus lire « 1:30 » de la même façon des deux côtés. */
    const SAISIE2 = fs.readFileSync(path.join(UI, 'components/SessionEvaluation.jsx'), 'utf8');
    assert.match(SAISIE2, /import \{[^}]*lireDuree[^}]*\} from "\.\.\/lib\/format\.js"/);
    assert.ok(!/function lireDuree/.test(SAISIE2), 'pas de seconde définition dans l\'écran');
});
