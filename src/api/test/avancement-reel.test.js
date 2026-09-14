/**
 * LA PASTILLE DE CONFORMITÉ N'ÉTAIT PAS UN INDICATEUR : C'ÉTAIT UNE CONSTANTE.
 *
 * LE DÉFAUT. Le tableau de bord et la page session affichaient `enrollment.conformite_score`,
 * en toutes lettres — « ROUGE », « ORANGE », « VERT ». Or cette colonne est écrite « ROUGE » à
 * l'inscription et n'est JAMAIS recalculée : aucune requête de l'application ne la met à jour,
 * seul un champ modifiable par l'API pourrait la changer, et aucun écran ne l'expose.
 *
 * MESURÉ EN PRODUCTION, sur les cinq dossiers de l'école : tous stockés à « ROUGE », alors que
 * leur avancement réel valait 31 %, 0 %, 19 %, 44 % et 19 % — quatre sur cinq auraient dû être
 * « ORANGE ». Deux écrans affichaient donc la même valeur pour tout le monde depuis toujours.
 *
 * UN EFFET DE BORD DU MÊME DÉFAUT : la vignette « dossiers à compléter » testait
 * `Number(x.conformite_score) < 100`. Sur la chaîne « ROUGE », `Number()` rend NaN, et
 * `NaN < 100` est FAUX : le compte restait à zéro quoi qu'il arrive, et l'alerte ne s'est
 * jamais affichée. Une comparaison numérique sur un mot ne lève rien — elle répond simplement
 * toujours non.
 *
 * ON NE REMPLIT PAS LA COLONNE POUR AUTANT. Un avancement se périme à chaque document envoyé,
 * chaque pièce validée, chaque étape ajoutée au parcours d'une formation : une valeur stockée
 * devrait être invalidée depuis une dizaine d'endroits, et le jour où l'un d'eux est oublié,
 * l'écran ment sans que rien ne le signale — exactement ce qui vient d'arriver. On calcule.
 *
 * LE CALCUL NE VIT QU'EN UN EXEMPLAIRE (`lib/avancement.js`) parce que ses trois appelants
 * n'ont pas les mêmes droits : `/api/suivi` est réservé aux rôles d'audit, alors qu'un
 * FORMATEUR peut ouvrir une session. Faire appeler le suivi par la page session aurait vidé
 * les pourcentages pour lui, sans erreur visible.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(RACINE, 'app/ui', f), 'utf8');

const AVANCEMENT = lire('lib/avancement.js');
const SUIVI = lire('controllers/suivi.controller.js');
const INSCRIPTIONS = lire('controllers/enrollment.controller.js');
const SESSION = lire('controllers/session.controller.js');
const TABLEAU = lireUi('pages/Dashboard.jsx');
const PAGE_SESSION = lireUi('pages/SessionDetail.jsx');

test('le calcul d\'avancement n\'existe qu\'en un exemplaire', () => {
    assert.match(AVANCEMENT, /async function avancementDossiers/);
    for (const [nom, SRC, ancre] of [
        /* Ancres avec ` = async` : `const getSession` attrape d'abord `getSessions`, le
           PLURIEL, qui vit plus haut dans le même fichier — et le découpage porte alors sur la
           mauvaise fonction, en silence. */
        ['suivi', SUIVI, 'const getSuivi = async'],
        ['liste des dossiers', INSCRIPTIONS, 'const getEnrollments = async'],
        ['session', SESSION, 'const getSession = async'],
    ]) {
        /* On lit le CORPS de la fonction concernée, pas le fichier entier : `getParcours` vit
           dans le même contrôleur que la liste des dossiers et calcule un parcours — c'est son
           objet même, pour UN dossier. Une assertion à l'échelle du fichier l'accuserait. */
        const bloc = SRC.slice(SRC.indexOf(ancre));
        const corps = bloc.slice(0, bloc.indexOf('\n};'));
        assert.match(corps, /avancementDossiers\(/, `${nom} doit appeler le calcul partagé`);
        assert.doesNotMatch(corps, /computeDocParcours\(\{ steps, docs/,
            `${nom} ne doit pas recalculer le parcours dans son coin`);
    }
});

test('seul le suivi paie la feuille de route', () => {
    /* `documents` est le gros de la charge utile : une pastille de pourcentage n'en a que
       faire, et la servir à chaque chargement du tableau de bord serait du poids pur. */
    assert.match(SUIVI, /\{ avecDocuments: true \}/);
    assert.doesNotMatch(INSCRIPTIONS, /avecDocuments: true/);
    assert.doesNotMatch(SESSION, /avecDocuments: true/);
});

test('les deux écrans montrent l\'avancement, plus le score figé', () => {
    for (const [nom, SRC] of [['tableau de bord', TABLEAU], ['page session', PAGE_SESSION]]) {
        assert.match(SRC, /<ProgressPct percent=\{e\.percent\} score=\{e\.score\}/,
            `${nom} doit afficher l'avancement calculé`);
        /* L'USAGE, pas le mot : les commentaires de ces fichiers expliquent précisément
           pourquoi cette colonne a été abandonnée, et interdire le mot les effacerait. */
        assert.doesNotMatch(SRC, /[.{]conformite_score/,
            `${nom} ne doit plus lire une colonne qui n'est jamais recalculée`);
        assert.doesNotMatch(SRC, /scoreBadge/, `${nom} : la pastille de score a disparu avec elle`);
    }
});

test('« dossiers à compléter » ne compare plus un mot à un nombre', () => {
    assert.match(TABLEAU, /\(Number\(x\.percent\) \|\| 0\) < 100/,
        'le seuil doit porter sur le pourcentage, pas sur une chaîne dont Number() rend NaN');
    assert.doesNotMatch(TABLEAU, /Number\(x\.conformite_score\)/);
});

test('la barre garde la couleur du score, elle ne la remplace pas', () => {
    /* Un pourcentage seul oblige à lire un nombre sur chaque ligne pour repérer celle qui va
       mal. La teinte se voit sans lecture, le nombre dit ensuite de combien. */
    const BARRE = lireUi('components/ProgressPct.jsx');
    assert.match(BARRE, /VERT:.*\n.*ORANGE:.*\n.*ROUGE:/,
        'les trois teintes du score doivent rester disponibles');
    assert.match(BARRE, /const s = score \|\| \(p >= 100 \? "VERT" : p > 0 \? "ORANGE" : "ROUGE"\)/,
        'sans score fourni, il se déduit du pourcentage — une barre grise n\'apprendrait rien');
    assert.match(BARRE, /Math\.max\(0, Math\.min\(100, Number\(percent\) \|\| 0\)\)/,
        'un pourcentage hors bornes déborderait visuellement de sa piste');
});
