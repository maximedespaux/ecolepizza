/**
 * « Pas de modèle, pas de document. »
 *
 * CE QUI A ÉTÉ OBSERVÉ, et qui motive ces tests : une convention de formation complète,
 * affichée SOUS un bandeau « Aucun modèle pour cette étape », déjà signée par l'organisme ET
 * par le stagiaire. Le corps venait de lib/render.js, un rendu de secours codé en dur qui
 * fabriquait un document plausible pour n'importe quel type.
 *
 * C'est le pire des cas pour une pièce contractuelle : son contenu n'était fixé nulle part.
 * Il dépendait du code de rendu, donc deux signatures apposées à six mois d'intervalle
 * pouvaient porter sur des textes différents, sans que rien ne le signale — ni au stagiaire
 * qui signe, ni à l'organisme qui archive.
 *
 * Trois barrières, dans cet ordre :
 *   1. l'ENVOI est refusé si aucun modèle n'existe — le seul moment où le problème est encore
 *      réparable sans conséquence ;
 *   2. l'AFFICHAGE ne fabrique plus rien : il renvoie `html: null` et `no_template: true` ;
 *   3. le rendu codé en dur n'existe PLUS. Le laisser en place, même sans appelant, aurait
 *      suffi à ce qu'on le rebranche un jour « juste pour dépanner ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const net = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const doc = net(lire('controllers/document.controller.js'));

test('le rendu codé en dur n\'existe plus dans le dépôt', () => {
    // Supprimé, pas seulement débranché : un module de secours qui traîne finit par resservir.
    assert.ok(!fs.existsSync(path.join(DIR, 'lib/render.js')),
        'lib/render.js est de retour — il fabrique un document pour n\'importe quel type');
    for (const f of fs.readdirSync(path.join(DIR, 'controllers'))) {
        assert.doesNotMatch(net(lire(`controllers/${f}`)), /renderDocumentHTML/,
            `${f} appelle encore le rendu de secours`);
    }
});

test('la consultation ne fabrique pas de corps sans modèle', () => {
    // getDocument passe par buildDocHtml, qui rend `null` quand le modèle manque.
    const bloc = doc.slice(doc.indexOf('const getDocument'), doc.indexOf('const getDocument') + 3000);
    assert.match(bloc, /const html = await buildDocHtml\(/,
        'le corps doit venir du modèle, via buildDocHtml');
    assert.match(bloc, /no_template:/,
        'la réponse doit dire au front POURQUOI il n\'y a pas de corps');
});

test('buildDocHtml rend null plutôt qu\'un contenu de substitution', () => {
    const bloc = doc.slice(doc.indexOf('async function buildDocHtml'));
    const corps = bloc.slice(0, bloc.indexOf('\n}') + 2);
    assert.match(corps, /if \(!slug\) return null/, 'sans slug, aucun corps');
    assert.match(corps, /if \(!content \|\| content\.kind !== 'builder'\) return null/,
        'sans modèle enregistré, aucun corps');
});

test('l\'envoi est refusé quand aucun modèle n\'existe', () => {
    // La barrière la plus importante : après l'envoi, le document a été vu, parfois signé.
    assert.match(doc, /async function motifModeleManquant/,
        'le contrôle avant envoi a disparu');
    const bloc = doc.slice(doc.indexOf('const sendDocument'), doc.indexOf('const sendDocument') + 1500);
    assert.match(bloc, /const motif = await motifModeleManquant\(/,
        'sendDocument doit vérifier avant de poser ENVOYE');
    assert.match(bloc, /if \(motif\) return res\.status\(422\)/,
        'le refus doit être explicite, avec le motif');
});

test('le refus dit OÙ corriger, pas seulement que ça a échoué', () => {
    const bloc = doc.slice(doc.indexOf('async function motifModeleManquant'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n') + 3);
    assert.match(corps, /Modèles de documents/,
        'le message doit nommer l\'écran où créer le modèle');
});

test('l\'envoi de groupe saute les documents sans modèle au lieu de les envoyer', () => {
    const bloc = doc.slice(doc.indexOf('async function sendPreparedDoc'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n') + 3);
    assert.match(corps, /motifModeleManquant/,
        'un envoi de groupe ne doit pas contourner la règle');
    // La vérification doit précéder l'UPDATE, sinon elle ne sert à rien.
    assert.ok(corps.indexOf('motifModeleManquant') < corps.indexOf("status = 'ENVOYE'"),
        'le contrôle doit venir AVANT le passage à ENVOYE');
});

test('les feuilles d\'émargement restent hors de la règle', () => {
    // Leur mise en page vient du code (lib/emargement.js) à partir du modèle d'émargement de
    // la session, pas d'un modèle de document. Les soumettre à la règle les bloquerait toutes.
    const bloc = doc.slice(doc.indexOf('async function motifModeleManquant'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n') + 3);
    assert.match(corps, /if \(isEmargDoc\(doc\)\) return null/,
        'l\'émargement doit être explicitement exclu');
});

test('les types de facture peuvent recevoir un modèle', () => {
    // FACTURE / ACOMPTE / AVOIR existaient côté facturation (invoice.type) mais n'étaient
    // proposés nulle part dans Modèles : aucun modèle ne pouvait leur être associé.
    const src = fs.readFileSync(path.join(DIR, '..', 'app/ui/pages/Modeles.jsx'), 'utf8');
    const bloc = src.slice(src.indexOf('const DOC_TYPES'), src.indexOf('const DOC_TYPES') + 600);
    for (const t of ['FACTURE', 'ACOMPTE', 'AVOIR']) {
        assert.match(bloc, new RegExp(`"${t}"`), `${t} absent du catalogue des types`);
    }
});
