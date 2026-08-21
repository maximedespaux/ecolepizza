/**
 * Une commande boutique passée par un stagiaire DOIT réveiller quelqu'un.
 *
 * LE DÉFAUT GELÉ ICI. La création d'une demande boutique insérait `shop_request` et ses lignes,
 * puis rendait la main — sans rien signaler. La commande n'existait donc que dans l'écran
 * « Demandes boutique », qu'il fallait penser à ouvrir. La pastille du menu comptait bien les
 * demandes en cours, mais une pastille ne réveille personne : elle ne dit pas qu'il vient
 * d'arriver quelque chose. Un stagiaire pouvait commander le vendredi soir et attendre le mardi
 * qu'on le remarque.
 *
 * Le mécanisme de notification existait pourtant déjà (`notify`), utilisé par la signature de
 * document et l'affectation d'un formateur. Il manquait seulement l'appel.
 *
 * Ces tests lisent le SOURCE (cf. CLAUDE.md § 2.5) : la fonction est une route Express derrière
 * l'authentification stagiaire, et la vérifier à l'exécution demanderait un serveur, une base et
 * une session — pour un contrat qui tient en trois lignes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcNotif = fs.readFileSync(path.join(APP, 'ui/pages/Notifications.jsx'), 'utf8');

/** Corps de la fonction qui enregistre une demande boutique. */
function corpsDeLaCommande() {
    const i = srcEspace.indexOf("INSERT INTO shop_request (");
    assert.notStrictEqual(i, -1, 'insertion de shop_request introuvable');
    const j = srcEspace.indexOf('res.status(201)', i);
    assert.notStrictEqual(j, -1, 'réponse 201 introuvable après l\'insertion');
    return srcEspace.slice(i, j);
}

test('enregistrer une commande émet une notification', () => {
    assert.match(corpsDeLaCommande(), /notify\(/,
        'aucun notify() entre l\'enregistrement de la commande et la réponse : '
        + 'la commande arriverait sans que personne ne soit prévenu');
});

test('la notification est importée depuis le contrôleur qui la fournit', () => {
    assert.match(srcEspace, /require\(['"]\.\/notification\.controller\.js['"]\)/,
        'notify doit venir de notification.controller.js');
});

test('elle pointe vers l\'écran des demandes boutique', () => {
    // Une notification sans lien oblige à chercher soi-même l'écran concerné.
    assert.match(corpsDeLaCommande(), /link:\s*['"]\/demandes-boutique['"]/,
        'le lien doit mener à /demandes-boutique');
});

test('elle est visible par tout l\'organisme, pas par un seul compte', () => {
    // `userId` absent = user_id NULL = tout l'organisme (cf. notification.controller).
    // Viser un utilisateur précis ferait rater la commande dès qu'il est absent.
    const corps = corpsDeLaCommande();
    const bloc = /notify\([\s\S]*?\}\);/.exec(corps);
    assert.ok(bloc, 'appel notify() illisible');
    assert.doesNotMatch(bloc[0], /userId:/,
        'la notification ne doit pas être adressée à un utilisateur particulier');
});

test('le corps du message porte de quoi décider sans ouvrir l\'écran', () => {
    // Un « Nouvelle commande » nu obligerait à ouvrir pour savoir si ça presse.
    const corps = corpsDeLaCommande();
    assert.match(corps, /nomStagiaire/, 'le nom du stagiaire doit figurer dans le message');
    assert.match(corps, /nbArticles/, 'le nombre d\'articles doit figurer dans le message');
    assert.match(corps, /totalTTC/, 'le montant doit figurer dans le message');
    assert.match(corps, /réf \$\{ref\}/, 'la référence de commande doit figurer dans le message');
});

test('la notification est ENREGISTRÉE avant que la réponse ne parte', () => {
    /* Le son et la cloche viennent d'un mécanisme déjà en place : toute réponse réussie diffuse
     * un `refresh` en SSE à l'organisme (broadcastMutations), chaque poste recharge ses
     * notifications dans la seconde, et le Topbar sonne dès que le compteur MONTE.
     *
     * D'où la course : si l'insertion n'est pas validée sur la base distante quand la réponse
     * part, le compteur n'a pas bougé au moment du rechargement — pas de son. Il faut alors
     * attendre le sondage de secours, jusqu'à vingt-cinq secondes. On la gagnait le plus souvent,
     * ce qui est le pire des cas : une alerte tantôt immédiate, tantôt en retard, sans raison
     * visible. */
    assert.match(corpsDeLaCommande(), /await notify\(/,
        'la notification doit être attendue, sinon le son peut arriver 25 s trop tard');
    const srcNotif = fs.readFileSync(path.join(API, 'controllers/notification.controller.js'), 'utf8');
    assert.match(srcNotif, /return db\.promise\(\)\s*\n?\s*\.query\(/,
        'notify doit rendre une promesse pour être attendable');
    assert.match(srcNotif, /\.catch\(\(err\) => \{ console\.error\('notification:'/,
        'et rester au mieux : une notification manquée ne doit pas faire échouer la commande');
});

test('le type BOUTIQUE a une couleur dans l\'écran des notifications', () => {
    // Sans entrée dans TONE, le repli neutre rendrait une commande visuellement identique
    // à une notification système.
    assert.match(srcNotif, /BOUTIQUE:\s*"[a-z]"/,
        'ajouter BOUTIQUE à la table TONE de Notifications.jsx');
});
