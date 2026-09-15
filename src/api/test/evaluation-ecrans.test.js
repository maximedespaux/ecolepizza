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
const NOTATION = lire('pages/Notation.jsx');
const MAIN = lire('main.jsx');
const NAV = lire('lib/nav.js');

test('LE FORMATEUR ATTEINT LA SAISIE — elle n\'est pas réservée au bureau', () => {
    /* LE DÉFAUT LE PLUS FACILE À RÉINTRODUIRE, et il a changé d'adresse : la saisie vivait sur
       la page de la session, au milieu de cinq cartes montées sous `isAdmin` — un rôle qui
       EXCLUT le formateur. Elle vit maintenant dans « Notation », dont la porte est la route et
       l'entrée de menu. Les régler sur ADMIN ou SUIVI « pour faire propre avec les voisines »
       retirerait l'écran de notation à la seule personne qui note.
       Le serveur, lui, décide seul du droit d'ÉCRIRE (STAFF_ROLES). */
    assert.match(NOTATION, /<SessionEvaluation key=\{choisie\} sessionId=\{choisie\} \/>/,
        'la saisie doit être montée dans la page Notation');
    assert.match(MAIN, /path="notation"[^\n]*roles=\{STAFF\}/,
        'la route /notation doit être ouverte au STAFF, formateur compris');
    assert.match(NAV, /\{ to: "\/notation",[^}]*roles: STAFF \}/,
        'et l\'entrée de menu aussi, sinon il ne la voit pas');
});

test('LA SESSION NE PORTE PLUS LA SAISIE — elle était noyée', () => {
    /* Elle y voisinait l'inscription, les consentements, les formateurs, les intervenants,
       l'émargement et le procès-verbal. La remettre là déplacerait le problème plutôt que de
       le régler, et l'on aurait DEUX endroits où noter — qui finiraient par ne plus dire la
       même chose. */
    assert.ok(!SESSION.includes('SessionEvaluation'),
        'la page de la session ne doit plus monter l\'écran de saisie');
});

test('CHANGER DE SESSION REMONTE L\'ÉCRAN DE SAISIE', () => {
    /* Sans `key`, les notes du groupe précédent resteraient affichées le temps du chargement —
       et une coche à cet instant partirait sur le mauvais dossier. Le même défaut, et la même
       parade, que la bascule formateur/jury dans l'éditeur de grille. */
    assert.match(NOTATION, /<SessionEvaluation key=\{choisie\}/);
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
    assert.match(lire('api/apiClient.js'), /getEvaluationSession\(sessionId, silent, role\)/);
    assert.match(SAISIE, /charger\(true\)/);
});

test('UN EXERCICE DÉSACTIVÉ NE REMONTE PAS DANS L\'ÉDITEUR — sinon l\'enregistrer le ressuscite', () => {
    /* Le serveur réactive tout exercice présent dans l'envoi (`active = 1`). Afficher les
       exercices retirés les renverrait tels quels au premier enregistrement : un exercice
       qu'on croyait sorti de la grille se remettrait à compter dans les totaux. */
    /* CHAQUE lecture de la réponse du serveur est vérifiée, pas seulement la première : il y en
       a deux (au chargement et après enregistrement), et n'en contrôler qu'une laisserait
       l'autre casser en silence — c'est ce qui vient d'arriver en éprouvant ce test.
       LES COMPÉTENCES SONT SOUMISES À LA MÊME RÈGLE : le serveur désactive une compétence
       retirée, et la renvoyer telle quelle la ressusciterait exactement comme un exercice. */
    /* ET LES CRITÈRES NE REMONTENT PAS DANS LA LISTE PLATE : ils appartiennent à leur
       compétence, qui les renvoie déjà. Sans cette exclusion ils repartaient en double à
       l'enregistrement — une fois comme critère, une fois comme exercice libre, donc détachés
       de leur compétence. Trouvé en éprouvant ce test. */
    for (const champ of ['exercices', 'competences']) {
        const lectures = [...GRILLE.matchAll(new RegExp(`\\(g\\.${champ} \\|\\| \\[\\]\\)(.{0,70})`, 'gs'))];
        assert.ok(lectures.length >= 2, `${champ} : le serveur renvoie la grille au chargement ET après enregistrement`);
        for (const m of lectures) {
            assert.match(m[1], /^\.filter\(/, `toute lecture de g.${champ} doit commencer par un filtre`);
            assert.match(m[1], /\bactive\b/, `le filtre de g.${champ} doit écarter les éléments désactivés`);
            /* ET LES CRITÈRES NE REMONTENT PAS DANS LA LISTE PLATE : ils appartiennent à leur
               compétence, qui les renvoie déjà. Sans cette exclusion ils repartaient en DOUBLE à
               l'enregistrement — une fois comme critère, une fois comme exercice libre, donc
               détachés de leur compétence. Trouvé en éprouvant ce test. */
            if (champ === 'exercices') {
                assert.match(m[1], /!e\.competence_id/,
                    'la liste plate ne doit pas reprendre les critères d\'une compétence');
            }
        }
    }
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
    assert.match(FORMATIONS, /<GrilleEvaluation [^>]*programId=\{program\.id\}/);
    /* CHANGER DE RÔLE DOIT REMONTER LE COMPOSANT. Sans `key`, l'état de la grille précédente
       (compétences, exercices) resterait affiché le temps du chargement — et un « Enregistrer »
       à cet instant écrirait la mauvaise grille sur le mauvais rôle. */
    assert.match(FORMATIONS, /<GrilleEvaluation key=\{evalRole\}/);
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
