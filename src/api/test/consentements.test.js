/**
 * LE REGISTRE DES CONSENTEMENTS — les règles qui rendent un consentement VALIDE.
 *
 * Un consentement invalide est pire que pas de consentement : l'organisme transmet en se croyant
 * couvert. Les quatre règles gelées ici sont celles qui l'invalideraient si elles sautaient.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('un refus ne se redemande jamais', () => {
    /* LA RÈGLE CENTRALE. Reposer la question à chaque connexion à quelqu'un qui a dit non le pousse
       à accepter pour avoir la paix : le consentement cesse d'être « libre » (art. 4(11)) et ne
       couvre plus rien. Seul `accorde === null` — jamais demandé — ouvre la fenêtre. */
    const src = sansCommentaires(lire(path.join(UI, 'components/ConsentModal.jsx')));
    assert.match(src, /liste\.find\(\(f\) => f\.accorde === null\)/,
        'Seule une finalité JAMAIS DEMANDÉE doit déclencher la fenêtre.');
    assert.doesNotMatch(src, /accorde === false/,
        'Un refus ne doit jouer aucun rôle dans le déclenchement : il se retient, il ne se relance pas.');
});

test('fermer sans répondre n\'enregistre rien', () => {
    /* « Ni oui ni non » ne doit pas pouvoir s'écrire comme un refus : on enregistrerait une réponse
       que personne n'a donnée. Le serveur exige donc un booléen explicite. */
    const ctrl = lire(path.join(API, 'controllers/espace.controller.js'));
    const bloc = ctrl.slice(ctrl.indexOf('const setMyConsent'), ctrl.indexOf('const setMyConsent') + 1400);
    assert.match(bloc, /typeof req\.body\?\.accorde !== 'boolean'/,
        'Le serveur doit refuser toute réponse qui ne soit pas explicitement oui ou non.');
    assert.match(bloc, /status\(422\)/);
});

test('les relances sont bornées', () => {
    /* Ne pas répondre n'est pas refuser — la question revient donc. Mais l'insistance produirait
       le consentement extorqué qu'on cherche à éviter : après trois fois, on cesse de la poser. */
    const src = lire(path.join(UI, 'components/ConsentModal.jsx'));
    assert.match(src, /const MAX_RELANCES = 3;/);
    assert.match(src, /if \(relances\(\) >= MAX_RELANCES\) return;/);
});

test('le registre AJOUTE une ligne, il n\'en modifie aucune', () => {
    /* C'est ce qui permet de démontrer l'état AU MOMENT DE CHAQUE ENVOI. Accepter en mars, être
       transmis en avril puis se rétracter en juin ne doit pas rendre l'envoi d'avril indéfendable :
       encore faut-il que la trace de mars existe toujours. */
    const lib = sansCommentaires(lire(path.join(API, 'lib/consentements.js')));
    assert.match(lib, /INSERT INTO consent_record/);
    assert.doesNotMatch(lib, /UPDATE consent_record|DELETE FROM consent_record/,
        'Modifier ou supprimer une ligne détruirait la preuve datée que le registre existe pour produire.');
});

test('la formulation et les destinataires sont figés dans chaque réponse', () => {
    const lib = sansCommentaires(lire(path.join(API, 'lib/consentements.js')));
    assert.match(lib, /f\.destinataires\.slice\(0, 500\), f\.formulation\.slice\(0, 600\)/,
        'Un consentement éclairé porte sur un TEXTE : reformuler plus tard ne doit pas réécrire le passé.');
});

test('le chemin du retour existe, dans les deux sens', () => {
    /* Se rétracter doit être aussi simple qu'accepter (art. 7.3) — et c'est la contrepartie de
       « on ne redemande pas » : puisque la fenêtre ne revient plus, il faut un endroit stable. */
    const prof = lire(path.join(UI, 'components/ProfileModal.jsx'));
    assert.match(prof, /function ConsentementsBloc\(\)/);
    assert.match(prof, /basculer\(f, false\)/, 'on doit pouvoir refuser après avoir accepté…');
    assert.match(prof, /basculer\(f, true\)/, '…et accepter après avoir refusé');
});

test('la page de confidentialité dit que cette transmission repose sur l\'accord', () => {
    const page = lire(path.join(UI, 'pages/Confidentialite.jsx'));
    assert.match(page, /Uniquement avec votre accord/,
        "Sans cette mention, un lecteur comprend que ses coordonnées partent de toute façon.");
    assert.match(page, /Mon profil → Visibilité/, 'et la page doit dire OÙ revenir sur sa réponse');
});

test('le code marche sans la migration 130', () => {
    /* Tant qu'elle n'est pas jouée, l'écran ne doit rien proposer plutôt qu'afficher une demande
       qu'il ne pourrait pas enregistrer. */
    const lib = lire(path.join(API, 'lib/consentements.js'));
    assert.match(lib, /if \(isMissingSchema\(e\)\) return null;/);
    const modal = lire(path.join(UI, 'components/ConsentModal.jsx'));
    assert.match(modal, /if \(!Array\.isArray\(liste\)\) return;/);
});
