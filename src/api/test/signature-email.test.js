/**
 * LA SIGNATURE DES E-MAILS (migration 197) — au bas de CHAQUE e-mail, composée par l'école.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · les images sont en PNG/JPEG/GIF, JAMAIS en WebP — Outlook ne lit pas le WebP, et une
 *     signature en icône cassée vaut pire que pas de signature ;
 *   · le HTML et les pièces jointes partagent les MÊMES cid (sig-logo, sig-badge-N) : un cid dans
 *     le HTML sans sa pièce sortirait cassé ;
 *   · l'aperçu porte les images en data: (un cid ne veut rien dire dans un navigateur) ;
 *   · un lien de réseau doit être http(s) ; les images et leur nombre sont bornés (corps JSON ≤ 2 Mo) ;
 *   · la signature entre dans la coquille commune (donc dans TOUS les e-mails) et ses images sont
 *     jointes par mailer à chaque envoi.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const sig = require('../lib/signatureEmail.js');

const PNG = 'data:image/png;base64,' + Buffer.from('x').toString('base64'); // minuscule, mais une vraie data URL PNG
const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');

test('parseConfig : objet, null si vide / illisible / désactivée', () => {
    assert.strictEqual(sig.parseConfig(null), null);
    assert.strictEqual(sig.parseConfig('pas du json'), null);
    assert.strictEqual(sig.parseConfig('{"actif":false,"sous_titre":"x"}'), null, 'désactivée → null (le pied texte reprend)');
    assert.deepStrictEqual(sig.parseConfig('{"sous_titre":"Administration"}'), { sous_titre: 'Administration' });
});

test('validerConfig : refuse le WebP, le trop lourd, un lien non http(s) ; borne et nettoie', () => {
    assert.match(sig.validerConfig({ logo: 'data:image/webp;base64,AAAA' }).erreur || '', /PNG, JPEG ou GIF/);
    const lourd = 'data:image/png;base64,' + 'A'.repeat(300000); // ~225 Ko décodés > 200 Ko
    assert.match(sig.validerConfig({ logo: lourd }).erreur || '', /200 Ko/);
    assert.match(sig.validerConfig({ facebook: 'ftp://x' }).erreur || '', /http/);

    const { valeur, erreur } = sig.validerConfig({
        sous_titre: '  Administration  ', site: ' ecole-pizza.com ', facebook: 'https://fb.com/x',
        logo: PNG, badges: [{ data: PNG }, { data: PNG }, { data: PNG }, { data: PNG }, { data: PNG }],
    });
    assert.strictEqual(erreur, undefined);
    assert.strictEqual(valeur.sous_titre, 'Administration', 'coupé et nettoyé');
    assert.strictEqual(valeur.site, 'ecole-pizza.com');
    assert.strictEqual(valeur.badges.length, 4, 'cinq badges proposés → quatre gardés');
    assert.strictEqual(valeur.actif, true);
});

test('imagesDe : logo puis badges, cid stables', () => {
    const images = sig.imagesDe({ logo: PNG, badges: [{ data: PNG }, { data: PNG }] });
    assert.deepStrictEqual(images.map((i) => i.cid), ['sig-logo', 'sig-badge-0', 'sig-badge-1']);
});

test('signatureAttachments : un cid et un buffer par image, les invalides écartés', () => {
    const pj = sig.signatureAttachments({ logo: PNG, badges: [{ data: 'pas une image' }, { data: PNG }] });
    assert.deepStrictEqual(pj.map((p) => p.cid), ['sig-logo', 'sig-badge-1'], 'le badge illisible est sauté, les cid gardent leur rang');
    assert.ok(Buffer.isBuffer(pj[0].content));
    assert.strictEqual(pj[0].contentDisposition, 'inline');
});

test('signatureHtml : cid dans l’e-mail, data: dans l’aperçu, null sans config', () => {
    assert.strictEqual(sig.signatureHtml(null), null);
    const c = { sous_titre: 'Administration', logo: PNG, badges: [{ data: PNG }] };
    const org = { short_name: 'École Pizza', phone: '05 62 50 18 64', email: 'contact@ecole-pizza.com' };

    const mail = sig.signatureHtml(c, org);
    assert.match(mail, /cid:sig-logo/);
    assert.match(mail, /cid:sig-badge-0/);
    assert.match(mail, /Administration/);
    assert.match(mail, /École Pizza/);
    assert.match(mail, /contact@ecole-pizza\.com/);
    assert.doesNotMatch(mail, /data:image\/png/, 'un e-mail n’embarque pas l’image en data: — elle est en pièce jointe');

    const apercu = sig.signatureHtml(c, org, { pourApercu: true });
    assert.match(apercu, /data:image\/png/, 'l’aperçu porte l’image en data:');
    assert.doesNotMatch(apercu, /cid:sig-logo/, 'un cid ne veut rien dire dans un navigateur');
});

test('la signature entre dans la coquille commune, donc dans TOUS les e-mails', () => {
    const tpl = lire(path.join(API, 'lib', 'mailTemplates.js'));
    /* Un seul squelette (coquille) sous tous les gabarits : la brancher là, c'est la mettre partout. */
    assert.match(tpl, /signatureHtml\(signature\(\)/, 'la coquille rend la signature');
    /* L’aperçu repasse les images de la signature en data: (sinon cid cassé dans l’iframe). */
    assert.match(tpl, /imagesDe\(signature\(\) \|\| \{\}\)/);

    const mailer = lire(path.join(API, 'lib', 'mailer.js'));
    assert.match(mailer, /signatureAttachments\(\)/, 'les images de la signature sont jointes à chaque envoi');
    assert.match(mailer, /\.\.\.logoAttachment\(\), \.\.\.signatureAttachments\(\)/);
});

test('l’éditeur : un onglet Signature, des images forcées en PNG, un aperçu serveur', () => {
    const page = lire(path.join(UI, 'pages', 'Mailing.jsx'));
    assert.match(page, /onglet === "signature" && <Signature/);
    assert.match(page, /function Signature\(/);
    /* PNG et non WebP : reduireEnPngDataUrl, pas reduireEnDataUrl (cf. ci-dessus, Outlook). */
    assert.match(page, /reduireEnPngDataUrl/);
    assert.doesNotMatch(page.match(/function Signature[\s\S]*?\n}/)?.[0] || '', /reduireEnDataUrl\b(?!Png)/);
    const client = lire(path.join(UI, 'api', 'apiClient.js'));
    assert.match(client, /export function saveSignatureMail/);
    assert.match(client, /export function apercuSignatureMail/);
});
