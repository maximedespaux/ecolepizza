/**
 * LES E-MAILS DE L'ÉCOLE, ÉCRITS PAR L'ÉCOLE (demandé le 2026-09-23, migration 178).
 *
 * « Mailing » n'offrait que cinq interrupteurs : on pouvait couper un e-mail, jamais en changer
 * un mot. L'école peut désormais réécrire l'objet, le titre et la prose des cinq automatiques, et
 * écrire elle-même à un groupe de stagiaires.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la CHARPENTE n'est pas modifiable — un e-mail d'identifiants garde son encadré, une alerte
 *     de sécurité garde son « ce n'était pas moi » ;
 *   · un jeton inconnu est REFUSÉ à l'enregistrement, jamais imprimé en accolades chez un
 *     stagiaire ;
 *   · le texte de l'école est du TEXTE : il est échappé, donc aucun e-mail ne peut être cassé ni
 *     détourné par ce qu'on tape ;
 *   · sans la 178, tout continue de marcher avec les textes d'origine ;
 *   · l'aperçu passe par les VRAIS gabarits, et ne laisse rien derrière lui.
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

const lib = require('../lib/mailsPersonnalises.js');
const modeles = require('../lib/mailTemplates.js');
const orgContext = require('../lib/orgContext.js');

test('un jeton inconnu est refusé AVANT l\'enregistrement', () => {
    /* Laissé passer, il partirait tel quel : « Bonjour {Prenom}, » avec ses accolades, dans le
       courrier d'un stagiaire — et personne ne pourrait plus le rattraper. */
    const r = lib.lireModeleMail('credentials', { objet: 'Bienvenue', titre: 'Accès', intro: 'Bonjour {Prenom},' });
    assert.match(r.erreur || '', /\{Prenom\} n’existe pas/);
    assert.match(r.erreur || '', /\{Prénom\}/, 'et l’erreur dit lesquels sont disponibles');

    /* L'objet et le titre sont obligatoires : sans objet un e-mail part en indésirable, sans
       titre il s'ouvre sur une carte vide. */
    assert.match(lib.lireModeleMail('credentials', { titre: 'x' }).erreur || '', /objet est obligatoire/);
    assert.match(lib.lireModeleMail('credentials', { objet: 'x' }).erreur || '', /titre est obligatoire/);
    /* L'intro et le pied, eux, peuvent être vides : une école qui veut un e-mail sec le peut. */
    assert.ok(lib.lireModeleMail('credentials', { objet: 'x', titre: 'y' }).valeurs);
    /* Et un type inventé n'existe pas. */
    assert.match(lib.lireModeleMail('facture', { objet: 'x', titre: 'y' }).erreur || '', /inconnu/);
});

test('le texte de l\'école est du TEXTE : échappé, en paragraphes, liens cliquables', () => {
    /* UN ÉDITEUR RICHE AURAIT PRODUIT DU HTML que les clients mail rendent chacun à leur façon —
       et une balise mal fermée casse l'e-mail là où personne ne peut plus la corriger. */
    const html = lib.texteEnHtml('Bonjour <b>Camille</b>,\n\nRendez-vous https://impastio.com/espace\nà 9 h.');
    assert.match(html, /&lt;b&gt;Camille&lt;\/b&gt;/, 'les balises tapées restent du texte');
    assert.ok(!/<b>Camille<\/b>/.test(html), 'aucune balise n’est interprétée');
    assert.strictEqual((html.match(/<p /g) || []).length, 2, 'une ligne vide sépare deux paragraphes');
    assert.match(html, /<a href="https:\/\/impastio\.com\/espace"/, 'un lien écrit en clair devient cliquable');
    assert.match(html, /à 9 h\./);
    assert.match(html, /<br>/, 'un simple retour à la ligne reste un retour à la ligne');

    /* L'ORDRE COMPTE : échapper APRÈS avoir posé le lien aurait affiché la balise en clair. */
    const src = lire(path.join(API, 'lib/mailsPersonnalises.js'));
    assert.match(src, /esc\(b\)\s*\n?\s*\.replace\(\/\(https\?:/, 'on échappe d’abord, on lie ensuite');
});

test('la charpente d\'un e-mail ne se réécrit pas', () => {
    /* Une école qui réécrirait TOUT pourrait envoyer une alerte de sécurité sans son bouton
       d'annulation, ou des identifiants sans mot de passe — et ne s'en apercevrait qu'à la
       plainte. On n'enregistre donc que quatre zones de prose. */
    const src = sansCommentaires(lire(path.join(API, 'lib/mailTemplates.js')));
    assert.match(src, /function zones\(cle, valeurs\)/);
    assert.match(src, /encadre\(\[ligneEncadre\('Identifiant'/, 'l’encadré des identifiants reste au code');
    assert.match(src, /bouton\(cancelUrl, "Ce n'était pas moi — annuler"\)/, 'et le garde-fou aussi');
    assert.match(src, /Si ce n'est PAS vous/);
    /* L'e-mail du représentant d'entreprise n'est PAS proposé à la réécriture : il n'est pas
       dans le catalogue, et son gabarit ne passe pas par `zones`. */
    assert.ok(!lib.MODELES_MAIL.representative, 'le catalogue ne propose que les cinq automatiques');
});

test('sans texte de l\'école, les e-mails restent ceux d\'origine', () => {
    /* NE PAS AVOIR ÉCRIT EST LE CAS NORMAL, pas une configuration manquante : il n'existe aucun
       état « e-mail vide ». */
    const c = modeles.credentialsEmail({
        firstName: 'Camille', email: 'c@exemple.fr', password: 'Aq7-42xb',
        loginUrl: 'https://impastio.com', orgName: 'École Pizza',
    });
    assert.strictEqual(c.subject, 'Vos identifiants de connexion — École Pizza');
    assert.match(c.html, /Bonjour Camille,/);
    assert.match(c.html, /Aq7-42xb/);
    assert.match(c.html, /Me connecter/);
});

test('le texte de l\'école remplace celui d\'origine, zone par zone', () => {
    /* `avecModeleTemporaire` est ce que l'aperçu emploie : il pose le texte, rend, et le RETIRE —
       y compris si le rendu échoue, sinon un aperçu raté ferait partir ce texte aux vrais
       destinataires jusqu'au prochain chargement du cache. */
    const rendu = orgContext.avecModeleTemporaire('credentials', {
        objet: 'Bienvenue chez {Organisme}', titre: 'Votre accès', intro: 'Salut {Prénom} !', pied: '',
    }, () => modeles.credentialsEmail({
        firstName: 'Camille', email: 'c@exemple.fr', password: 'Aq7-42xb', loginUrl: '', orgName: 'École Pizza',
    }));
    assert.strictEqual(rendu.subject, 'Bienvenue chez École Pizza');
    assert.match(rendu.html, /Salut Camille !/);
    assert.match(rendu.html, /Aq7-42xb/, 'la charpente reste');
    assert.ok(!/Par sécurité, pensez à changer/.test(rendu.html),
        'un pied vidé volontairement ne revient pas par le défaut');

    /* ET APRÈS, PLUS RIEN : le cache est rendu tel qu'il était. */
    assert.strictEqual(orgContext.modeleMail('credentials'), null);
    let echoue = false;
    try { orgContext.avecModeleTemporaire('credentials', { objet: 'x' }, () => { throw new Error('boum'); }); }
    catch { echoue = true; }
    assert.ok(echoue);
    assert.strictEqual(orgContext.modeleMail('credentials'), null, 'même quand le rendu échoue');
});

test('un envoi à un groupe est borné, tracé, et ne se fait pas passer pour un envoi automatique', () => {
    const src = sansCommentaires(lire(path.join(API, 'controllers/mailing.controller.js')));
    /* PAS DE `kind` : les cinq interrupteurs coupent des e-mails AUTOMATIQUES. Couper un envoi
       décidé à l'instant au nom d'un réglage fait pour autre chose rendrait le bouton muet. */
    assert.match(src, /await sendMail\(\{ to: l\.email, subject, html \}\);/);
    /* SÉQUENTIEL : une rafale de trente connexions SMTP se traite comme du spam. */
    assert.match(src, /for \(const l of avec\) \{/);
    assert.match(src, /if \(avec\.length > MAX_DESTINATAIRES\)/);
    /* CHAQUE ÉCHEC EST COMPTÉ, l'envoi continue : un envoi à moitié parti doit se voir. */
    assert.match(src, /if \(r\.sent\) envoyes \+= 1; else echecs \+= 1;/);
    assert.match(src, /INSERT INTO mail_envoi/, 'et il en reste une trace');
    /* SANS LA 178, l'envoi ne PERD pas le compte : la trace manque, l'envoi a eu lieu. */
    assert.match(src, /journalise = false;/);
    /* CEUX QU'ON NE PEUT PAS JOINDRE SE DISENT : une session de douze où trois fiches n'ont pas
       d'adresse enverrait neuf messages en annonçant douze. */
    assert.match(src, /sans_email: liste\.filter\(\(l\) => !l\.email\)/);
});

test('l\'écran dit ce qui n\'est pas modifiable, et ce que cet envoi n\'est pas', () => {
    const page = sansCommentaires(lire(path.join(UI, 'pages/Mailing.jsx')));
    assert.match(page, /\{modele\.charpente\}/, 'chaque type dit ce qui reste au code');
    assert.match(page, /Pas de démarchage/, 'l’envoi à un groupe annonce sa nature');
    /* L'APERÇU EST ISOLÉ : du HTML d'e-mail injecté dans la page emporterait ses styles. */
    assert.match(page, /<iframe title="Aperçu de l'e-mail" sandbox="" srcDoc=\{rendu\.html\}/);
    /* LES TROIS ONGLETS : couper un e-mail, changer son texte, en écrire un. */
    for (const t of ['Envois automatiques', 'Textes des e-mails', 'Écrire à un groupe']) {
        assert.ok(page.includes(t), `l’onglet « ${t} » doit exister`);
    }
    /* ENVOYER SE CONFIRME : un envoi part tout de suite et ne se rattrape pas. */
    assert.match(page, /window\.confirm\(`Envoyer ce message/);
});

test('la 178 crée les deux tables, et son revert dit ce qu\'il détruit', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = lire(path.join(MIG, '178_mails_personnalises.sql'));
    const revert = lire(path.join(MIG, '178_revert_mails_personnalises.sql'));
    assert.match(aller, /CREATE TABLE IF NOT EXISTS mail_modele/);
    assert.match(aller, /CREATE TABLE IF NOT EXISTS mail_envoi/);
    assert.match(aller, /UNIQUE KEY uq_mail_modele \(organization_id, cle\)/,
        'deux lignes pour un même type feraient dépendre l’e-mail de l’ordre de lecture');
    assert.ok(!/--/.test(aller), 'commentaires en blocs, jamais en tirets');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse dans une migration');
    assert.match(revert, /DROP TABLE IF EXISTS mail_envoi/);
    assert.match(revert, /CE QUI SE PERD/);
});

test('les cinq types de l\'écran sont ceux du catalogue', () => {
    /* UNE LISTE EN DOUBLE FINIT PAR DIVERGER : l'écran proposerait un type que le serveur ne
       connaît pas, ou couperait un e-mail dont personne ne pourrait changer le texte. */
    const page = lire(path.join(UI, 'pages/Mailing.jsx'));
    const interrupteurs = [...page.matchAll(/\["mail_(\w+)",/g)].map((m) => m[1]);
    assert.deepStrictEqual(interrupteurs.sort(), [...lib.CLES_MAIL].sort());
    /* Et les colonnes de la 138 portent les mêmes clés, côté serveur. */
    const org = lire(path.join(API, 'lib/orgContext.js'));
    for (const cle of lib.CLES_MAIL) assert.match(org, new RegExp(`${cle}: 'mail_${cle}'`));
});
