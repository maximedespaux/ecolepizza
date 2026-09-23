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
    assert.match(src, /const html = esc\(b\)/, 'on échappe d’abord, on met en forme ensuite');
});

test('un lien se cache derrière des mots, et une adresse refusée ne casse pas la phrase', async () => {
    /* CE QUE L'ÉCOLE DEMANDAIT (2026-09-23) : écrire « cliquez ICI » au lieu d'étaler une URL de
       quarante caractères. La syntaxe est celle de Markdown, pour la seule raison qui vaille :
       c'est celle que les gens connaissent déjà. */
    const html = lib.texteEnHtml('Cliquez [ICI](https://impastio.com/espace) pour accéder.');
    assert.match(html, /<a href="https:\/\/impastio\.com\/espace"[^>]*>ICI<\/a>/);
    assert.ok(!/impastio\.com\/espace<\/a>/.test(html), 'l’adresse ne s’affiche pas en plus des mots');

    /* UNE ADRESSE ÉCRITE EN CLAIR RESTE CLIQUABLE, et n'est pas re-liée à l'intérieur du lien
       nommé qu'on vient de poser — c'est tout l'objet de l'ordre des remplacements. */
    const deux = lib.texteEnHtml('Voir [le programme](https://impastio.com/p) ou https://impastio.com');
    assert.strictEqual((deux.match(/<a /g) || []).length, 2);

    /* TOUT CE QUI N'EST PAS http(s) EST REFUSÉ : `javascript:` ne ferait rien dans un client
       mail, mais la même chaîne passe par l'APERÇU, rendu dans le navigateur. On garde alors les
       MOTS, sans lien : le message reste lisible et le manque se voit à l'aperçu. */
    const sale = lib.texteEnHtml('Cliquez [ICI](javascript:alert(1)) maintenant');
    assert.ok(!/<a /.test(sale), 'aucun lien');
    assert.ok(!/javascript:/.test(sale), 'et rien de l’adresse ne survit');
    assert.match(sale, /ICI/, 'mais les mots restent');
    assert.strictEqual(lib.lienSur('https://x.fr'), true);
    assert.strictEqual(lib.lienSur('javascript:alert(1)'), false);
    assert.strictEqual(lib.lienSur('mailto:a@b.fr'), false, 'ce qui n’est pas prévu est refusé');
});

test('une image entre dans le texte, et voyage AVEC le message', async () => {
    /* PAS D'IMAGE DISTANTE : les clients mail les bloquent par défaut (« afficher les images ? »)
       et une image chargée depuis un serveur trace qui ouvre le courrier. Elle part donc en pièce
       jointe, désignée par `cid:` — comme le logo, depuis toujours. */
    const html = lib.texteEnHtml('![Affiche](image:abc123)', undefined, { image: (id) => `cid:img-${id}` });
    assert.match(html, /<img src="cid:img-abc123" alt="Affiche"/);
    assert.match(html, /max-width:100%/, 'une image large ne doit pas déborder du cadre');

    /* IMAGE INCONNUE (supprimée depuis, ou migration 180 non jouée) : le marqueur DISPARAÎT.
       Mieux vaut un blanc qu'un « ![Affiche](image:abc123) » imprimé chez un stagiaire. */
    assert.strictEqual(lib.texteEnHtml('![Affiche](image:abc123)', undefined, { image: () => null }), '');
    assert.strictEqual(lib.texteEnHtml('![Affiche](image:abc123)'), '');

    /* LE MAILER JOINT CE QU'ON LUI DONNE, en plus du logo. */
    const mailer = sansCommentaires(lire(path.join(API, 'lib/mailer.js')));
    assert.match(mailer, /attachments: \[\.\.\.logoAttachment\(\), \.\.\.\(Array\.isArray\(attachments\) \? attachments : \[\]\)\]/);
    const ctrl = sansCommentaires(lire(path.join(API, 'controllers/mailing.controller.js')));
    assert.match(ctrl, /cid: `img-\$\{i\.id\}`, contentDisposition: 'inline'/);
    /* L'APERÇU, LUI, NE PEUT PAS UTILISER `cid:` : son iframe est en bac à sable, sans origine ni
       cookie — l'image doit être DANS le HTML. */
    const tpl = sansCommentaires(lire(path.join(API, 'lib/mailTemplates.js')));
    assert.match(tpl, /pourApercu\s*\n?\s*\? `data:\$\{img\.mime\};base64,/);
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
    assert.match(src, /await sendMail\(\{ to: l\.email, subject, html, attachments: piecesImages\(images\) \}\);/);
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

test('chacun reçoit SON message, et l\'école en garde UNE copie', () => {
    /* UN ENVOI UNIQUE EN COPIE CACHÉE A ÉTÉ ESSAYÉ, puis retiré (2026-09-23) : il n'a qu'UN corps
       pour tout le monde, donc aucun {Prénom} rempli. La boucle reste — chacun reçoit son
       message, et personne ne partage d'enveloppe, donc personne ne voit l'adresse d'un autre. */
    const src = sansCommentaires(lire(path.join(API, 'controllers/mailing.controller.js')));
    assert.match(src, /for \(const l of avec\) \{/);
    assert.match(src, /await sendMail\(\{ to: l\.email, subject, html, attachments: piecesImages\(images\) \}\)/);
    assert.ok(!/bcc:/.test(src), 'plus de copie cachée groupée');

    /* UNE SEULE COPIE À L'ÉCOLE, et non une par destinataire : la mettre en copie de chaque
       message lui en ferait quinze dans sa boîte pour un seul envoi. Elle est annoncée pour ce
       qu'elle est, sans quoi elle se lirait comme un message qui lui est adressé. */
    assert.match(src, /if \(adresseEcole && envoyes > 0\)/);
    assert.match(src, /\[Copie\] \$\{subject\}/);
    assert.match(src, /Copie de l’envoi à \$\{envoyes\} destinataire/);
});

test('l\'écran dit où part la copie, et propose lien et image', () => {
    const page = sansCommentaires(lire(path.join(UI, 'pages/Mailing.jsx')));
    /* La copie : dite quand elle part, dite aussi quand elle NE PART PAS — sans quoi l'école
       croirait garder une trace qu'elle n'a pas. */
    assert.match(page, /Aucune copie pour l'école&nbsp;: renseignez son adresse/);
    assert.match(page, /Une <b>copie<\/b> part à/);

    /* LES DEUX GESTES DEMANDÉS, dans la même barre que les jetons — et la MÊME barre pour un
       message de groupe et pour une règle programmée : deux copies auraient fini par diverger,
       et un bouton présent d'un côté seulement se lit comme une panne. */
    assert.match(page, /function BarreInsertion\(\{ jetons, onInserer, onStatus \}\)/);
    assert.strictEqual((page.match(/<BarreInsertion /g) || []).length, 2);
    assert.match(page, /onInserer\(`\[\$\{mots\.trim\(\)\}\]\(\$\{url\.trim\(\)\}\)`\)/, 'le lien s’insère en texte');
    assert.match(page, /onInserer\(`!\[\$\{r\.data\.nom \|\| "image"\}\]\(image:\$\{r\.data\.id\}\)`\)/);
    /* L'ADRESSE EST VÉRIFIÉE À LA SAISIE aussi : le serveur refuse déjà tout ce qui n'est pas
       http(s), mais le dire tout de suite évite d'envoyer un message dont le lien a disparu. */
    assert.match(page, /L'adresse doit commencer par http:\/\/ ou https:\/\//);
});

test('la 180 range les images en base, et son revert dit ce qu\'il détruit', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = lire(path.join(MIG, '180_mail_images.sql'));
    assert.match(aller, /CREATE TABLE IF NOT EXISTS mail_image/);
    assert.match(aller, /octets\s+longblob\s+NOT NULL/, 'le fichier part en base, jamais sur le disque');
    assert.ok(!/--/.test(aller), 'commentaires en blocs');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse');
    assert.match(lire(path.join(MIG, '180_revert_mail_images.sql')), /CE QUI SE PERD/);
});
