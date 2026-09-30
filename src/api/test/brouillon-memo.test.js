/**
 * LE MÉMO EN COURS D'ÉCRITURE NE SE PERD PLUS — demandé par l'école le 2026-09-30 : « si on est en
 * train d'écrire un mémo et qu'on le ferme, tout le contenu est effacé : le garder en mémoire jusqu'à
 * l'envoi ou la suppression, au rechargement comme à la fermeture ».
 *
 * LE DÉFAUT : le texte, les liens, l'échéance et le partage vivaient DANS le panneau du mémo. Le
 * fermer — la croix, Échap, un clic à côté pour aller lire un numéro sur la page — jetait le
 * panneau, et ce qu'on écrivait avec.
 *
 * CE QUI EST GARDÉ ICI : le brouillon vit hors de l'écran (lib/brouillonMemo.js) ; il tient à la
 * fermeture ET au rechargement ; il finit quand on l'envoie ou qu'on l'efface ; et c'est une note
 * PRIVÉE — jamais montrée à un autre compte, partie à la déconnexion.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const CLE = 'impastio:memo-brouillon';

/* La réserve de l'onglet, factice. Posée par `defineProperty` : Node a la sienne, en lecture seule. */
const reserve = {
    d: new Map(),
    getItem(k) { return this.d.has(k) ? this.d.get(k) : null; },
    setItem(k, v) { this.d.set(k, String(v)); },
    removeItem(k) { this.d.delete(k); },
};
Object.defineProperty(globalThis, 'sessionStorage', { value: reserve, configurable: true, writable: true });

/* UN RECHARGEMENT DE PAGE, c'est un module neuf qui relit la réserve : chaque appel en charge un. */
let charge = 0;
const pageNeuve = () => import(`${pathToFileURL(path.join(UI, 'lib', 'brouillonMemo.js')).href}?page=${++charge}`);
const LIEN = { type: 'stagiaire', id: '11111111-1111-4111-8111-111111111111', libelle: 'Camille BERGER' };

test('FERMER LE PANNEAU ne perd rien : le brouillon vit hors de l\'écran', async () => {
    reserve.d.clear();
    const b = await pageNeuve();
    assert.ok(b.brouillonVide(b.lireBrouillon('u1')));
    b.ecrireBrouillon({ texte: 'Rappeler @Camille BERGER demain', liens: [LIEN], echeance: '2026-10-05', partage: true });
    // Le panneau se ferme, puis se rouvre : un autre composant lit le même brouillon.
    const relu = b.lireBrouillon('u1');
    assert.deepStrictEqual([relu.texte, relu.liens, relu.echeance, relu.partage],
        ['Rappeler @Camille BERGER demain', [LIEN], '2026-10-05', true]);
    assert.strictEqual(b.lireBrouillon('u1'), relu, 'le même objet tant que rien ne change : `useSyncExternalStore` l\'exige');
    // Les écrans ouverts en même temps (panneau et tableau de bord) sont prévenus.
    let prevenus = 0;
    const desabonner = b.abonnerBrouillon(() => { prevenus++; });
    b.ecrireBrouillon({ texte: 'Rappeler demain' });
    assert.strictEqual(prevenus, 1);
    desabonner();
    b.ecrireBrouillon({ texte: 'Rappeler' });
    assert.strictEqual(prevenus, 1);
});

test('RECHARGER LA PAGE garde le texte, les liens, l\'échéance et le partage', async () => {
    reserve.d.clear();
    const avant = await pageNeuve();
    avant.lireBrouillon('u1');
    avant.ecrireBrouillon({ texte: 'Commander la farine\n* T65\n* T45', liens: [LIEN], echeance: '2026-10-05', partage: true });
    const apres = await pageNeuve();
    const relu = apres.lireBrouillon('u1');
    assert.deepStrictEqual([relu.texte, relu.liens, relu.echeance, relu.partage],
        ['Commander la farine\n* T65\n* T45', [LIEN], '2026-10-05', true]);
});

test('LES FICHIERS JOINTS tiennent à la fermeture, pas au rechargement — et ne sont jamais gravés', async () => {
    reserve.d.clear();
    const b = await pageNeuve();
    b.lireBrouillon('u1');
    const piece = { cle: 'k1', nom: 'capture.webp', type: 'image/webp', octets: 1234, blob: { size: 1234 }, apercu: null };
    b.ecrireBrouillon({ texte: 'Voir la capture', fichiers: [piece] });
    assert.deepStrictEqual(b.lireBrouillon('u1').fichiers, [piece], 'rouvert, le panneau la retrouve');
    const grave = JSON.parse(reserve.getItem(CLE));
    assert.deepStrictEqual(Object.keys(grave).sort(), ['echeance', 'liens', 'partage', 'texte', 'uid'], 'des octets n\'ont rien à faire dans la réserve');
    const apres = await pageNeuve();
    assert.deepStrictEqual([apres.lireBrouillon('u1').texte, apres.lireBrouillon('u1').fichiers], ['Voir la capture', []]);
    // Une pièce seule, sans texte : le brouillon existe en mémoire, et rien n'est gravé.
    b.ecrireBrouillon({ texte: '' });
    assert.ok(!b.brouillonVide(b.lireBrouillon('u1')));
    assert.strictEqual(reserve.getItem(CLE), null);
});

test('ENVOYÉ OU EFFACÉ, il ne reste rien — ni en mémoire, ni dans la réserve', async () => {
    reserve.d.clear();
    const b = await pageNeuve();
    b.lireBrouillon('u1');
    b.ecrireBrouillon({ texte: 'Un mémo', partage: true });
    assert.ok(reserve.getItem(CLE));
    b.viderBrouillon();
    assert.ok(b.brouillonVide(b.lireBrouillon('u1')));
    assert.strictEqual(reserve.getItem(CLE), null);
    assert.ok((await pageNeuve()).brouillonVide((await pageNeuve()).lireBrouillon('u1')), 'rechargé après l\'envoi : vide');
    // Tout effacer à la main revient au même : un brouillon vide n'est pas gardé.
    b.ecrireBrouillon({ texte: 'x' });
    b.ecrireBrouillon({ texte: '' });
    assert.strictEqual(reserve.getItem(CLE), null);
});

test('UNE NOTE PRIVÉE : jamais montrée à un autre compte, et partie à la déconnexion', async () => {
    reserve.d.clear();
    const b = await pageNeuve();
    b.lireBrouillon('u1');
    b.ecrireBrouillon({ texte: 'Le pense-bête de Jean' });
    // Un autre compte sur le même onglet (session expirée, puis autre connexion) : il ne le voit pas…
    const autre = await pageNeuve();
    assert.ok(autre.brouillonVide(autre.lireBrouillon('u2')));
    // …et il n'en reste rien dans la réserve.
    assert.strictEqual(reserve.getItem(CLE), null);

    // La déconnexion l'efface, en mémoire comme dans la réserve.
    b.lireBrouillon('u1');
    b.ecrireBrouillon({ texte: 'Encore un' });
    b.oublierBrouillon();
    assert.strictEqual(reserve.getItem(CLE), null);
    assert.ok(b.brouillonVide(b.lireBrouillon('u1')));
    assert.match(lire('context/UserContext.jsx'), /oublierBrouillon\(\);/, 'la déconnexion doit l\'appeler');
    // Sans compte, rien n'est gravé.
    const sans = await pageNeuve();
    sans.lireBrouillon(null);
    sans.ecrireBrouillon({ texte: 'personne' });
    assert.strictEqual(reserve.getItem(CLE), null);
});

test('UNE RÉSERVE ABÎMÉE OU FERMÉE ne casse rien', async () => {
    reserve.d.clear();
    reserve.setItem(CLE, '{pas du json');
    assert.ok((await pageNeuve()).brouillonVide((await pageNeuve()).lireBrouillon('u1')));
    // Ce qu'on relit est remis en forme : on ne fait pas confiance à la réserve.
    reserve.setItem(CLE, JSON.stringify({ uid: 'u1', texte: 'x'.repeat(5000), liens: [{ type: 1 }, LIEN, null], echeance: 'demain', partage: 'oui' }));
    const relu = (await pageNeuve()).lireBrouillon('u1');
    assert.deepStrictEqual([relu.texte.length, relu.liens, relu.echeance, relu.partage], [1000, [LIEN], '', false]);
    // Pas de réserve du tout (navigation privée stricte) : le brouillon tient quand même à la fermeture.
    Object.defineProperty(globalThis, 'sessionStorage', { get() { throw new Error('interdit'); }, configurable: true });
    try {
        const b = await pageNeuve();
        b.lireBrouillon('u1');
        b.ecrireBrouillon({ texte: 'en mémoire seulement' });
        assert.strictEqual(b.lireBrouillon('u1').texte, 'en mémoire seulement');
    } finally {
        Object.defineProperty(globalThis, 'sessionStorage', { value: reserve, configurable: true, writable: true });
    }
});

test('COLLER UNE CAPTURE LA JOINT — mais du texte collé reste du texte', async () => {
    const m = await import(pathToFileURL(path.join(UI, 'lib', 'memos.js')).href);
    const image = { type: 'image/png', name: 'image.png', size: 2000 };
    const presse = (texte, files) => ({ getData: (t) => (t === 'text/plain' ? texte : ''), files });
    assert.deepStrictEqual(m.fichiersColles(presse('', [image])), [image], 'une capture d\'écran : seulement l\'image');
    /* Trois cellules d'un tableur posent dans le presse-papiers le texte ET une image de ce texte :
       coller doit écrire le texte. */
    assert.deepStrictEqual(m.fichiersColles(presse('Farine T65\t25 kg', [image])), []);
    assert.deepStrictEqual(m.fichiersColles(presse('', [{ type: 'text/html', name: 'x.html' }])), []);
    assert.deepStrictEqual(m.fichiersColles(null), []);

    assert.strictEqual(m.genreFichier('application/pdf'), 'pdf');
    assert.strictEqual(m.genreFichier('image/webp'), 'image');
    assert.strictEqual(m.genreFichier('image/heic'), null, 'un HEIC ne se réencode pas dans un navigateur');
    assert.strictEqual(m.genreFichier('image/svg+xml'), null);
    // Le refus se lit sur ce qui PARTIRA : l'image déjà réduite.
    assert.strictEqual(m.refusDeFichier({ type: 'image/webp', size: 400 * 1024 }), null);
    assert.match(m.refusDeFichier({ type: 'image/webp', size: 1025 * 1024 }), /1 Mo au plus/);
    assert.match(m.refusDeFichier({ type: 'image/gif', size: 1000 }), /n'a pas pu être convertie/);
    assert.strictEqual(m.refusDeFichier({ type: 'application/pdf', size: 4 * 1024 * 1024 }), null);
    assert.match(m.refusDeFichier({ type: 'application/pdf', size: 6 * 1024 * 1024 }), /5 Mo au plus/);
    assert.match(m.refusDeFichier({ type: 'application/zip', size: 10 }), /une image ou un PDF/);
    assert.strictEqual(m.poidsLisible(340 * 1024), '340\u00a0Ko');
    assert.strictEqual(m.poidsLisible(1258291), '1,2\u00a0Mo');
});

test('L\'ÉCRAN : le brouillon hors du composant, « Effacer », le trombone et le collage', () => {
    const liste = lire('components/MemoListe.jsx');
    assert.match(liste, /const brouillon = useSyncExternalStore\(abonnerBrouillon, \(\) => lireBrouillon\(uid\)\);/);
    assert.doesNotMatch(liste, /const \[texte, setTexte\] = useState\(""\)/, 'un état du composant meurt avec lui');
    assert.match(liste, /viderBrouillon\(\); setSuggestions\(null\); setMention\(null\);/, 'envoyé, le brouillon a fini sa vie');
    assert.match(liste, /\{!brouillonVide\(brouillon\) && \(\s*<button type="button" className="btn ghost sm" onClick=\{effacerBrouillon\}>Effacer<\/button>/,
        'ce qui tient à la fermeture doit pouvoir s\'effacer d\'un geste');
    assert.match(liste, /onPaste=\{surCollage\}/);
    assert.match(liste, /\{pieces && \(/, 'pas de trombone sans la migration 193');
    assert.match(liste, /disabled=\{fichiers\.length >= MAX_FICHIERS\}/);
    assert.match(liste, /<img src=\{url\} alt=\{f\.nom\} loading="lazy" \/>/, 'une vignette ne se charge que si on la voit');
    const client = lire('api/apiClient.js');
    assert.match(client, /fd\.append\("noms", JSON\.stringify\(fichiers\.map\(\(f\) => f\.nom\)\)\);/, 'les noms à part, en UTF-8');
    assert.match(client, /if \(!fichiers\.length\) return request\("\/memos", \{ method: "POST", body: JSON\.stringify\(payload\) \}\);/,
        'sans pièce, le mémo part en JSON comme avant');
});
