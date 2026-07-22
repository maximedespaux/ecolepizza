/**
 * Règlement en plusieurs moyens de paiement (300 € espèces + 700 € carte).
 *
 * Deux garanties : la répartition DOIT tomber sur le total (une caisse qui ne boucle pas est une
 * erreur, pas une donnée), et le détail chiffré survit pour le rapprochement. Tests sur le
 * calcul réel (`resolvePayments`, côté UI) et sur le contrôleur de vente.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const net = (f) => fs.readFileSync(path.join(DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** Charge resolvePayments + estCheque (module UI ESM) dans ce contexte. On prend le bloc entre
 *  `export const estCheque` et `export default` — les deux helpers purs, sans le composant React
 *  ni ses imports. Un scan d'accolade naïf casserait sur les blocs imbriqués du .map. */
const resolvePayments = (() => {
    const src = fs.readFileSync(path.join(DIR, '..', 'app/ui/components/PaiementSplit.jsx'), 'utf8');
    const début = src.indexOf('export const estCheque');
    const fin = src.indexOf('export default');
    const code = src.slice(début, fin).replace(/export /g, '') + '\nmodule.exports = resolvePayments;';
    const m = { exports: {} };
    new Function('module', 'exports', code)(m, m.exports);
    return m.exports;
})();

// --- Le calcul de répartition (UI) ----------------------------------------------------------

test('le dernier moyen prend automatiquement le solde', () => {
    // L'exemple de la demande : 1000 au total, 300 en espèces → 700 en carte, sans le saisir.
    const { parts, reste, valid } = resolvePayments(
        [{ method: 'Espèces', amount: '300' }, { method: 'CB', amount: '' }], 1000);
    assert.strictEqual(reste, 700, 'le solde n\'est pas déduit');
    assert.deepStrictEqual(parts, [{ method: 'Espèces', amount: 300 }, { method: 'CB', amount: 700 }]);
    assert.ok(valid);
});

test('un paiement simple couvre tout le total, sans rien saisir', () => {
    const { parts, valid } = resolvePayments([{ method: 'CB', amount: '' }], 49.9);
    assert.deepStrictEqual(parts, [{ method: 'CB', amount: 49.9 }]);
    assert.ok(valid);
});

test('un dépassement est signalé, pas accepté', () => {
    // Le dernier moyen prend TOUJOURS le solde : le dépassement ne peut venir que des lignes
    // saisies AVANT lui. 800 en espèces sur 1000 → solde 200, valide.
    const ok = resolvePayments([{ method: 'Espèces', amount: '800' }, { method: 'CB', amount: '' }], 1000);
    assert.strictEqual(ok.reste, 200, 'le solde reste positif tant qu\'on ne dépasse pas');
    assert.ok(ok.valid);

    // 1200 en espèces sur 1000 : le solde du dernier deviendrait négatif → invalide.
    const trop = resolvePayments([{ method: 'Espèces', amount: '1200' }, { method: 'CB', amount: '' }], 1000);
    assert.ok(trop.reste < 0, 'le solde du dernier moyen passe sous zéro');
    assert.ok(!trop.valid, 'une répartition qui dépasse ne doit pas être valide');
});

test('les lignes à zéro ne partent pas dans la répartition', () => {
    const { parts } = resolvePayments(
        [{ method: 'Espèces', amount: '0' }, { method: 'CB', amount: '' }], 500);
    assert.deepStrictEqual(parts, [{ method: 'CB', amount: 500 }], 'une ligne à 0 € est écartée');
});

// --- Les infos du chèque --------------------------------------------------------------------

test('un chèque emporte sa banque et son numéro', () => {
    const { parts } = resolvePayments(
        [{ method: 'Chèque', amount: '', bank: 'Crédit Agricole', cheque_number: '0004567' }], 250);
    assert.deepStrictEqual(parts, [
        { method: 'Chèque', amount: 250, bank: 'Crédit Agricole', cheque_number: '0004567' },
    ], 'banque et numéro doivent accompagner le chèque');
});

test('deux chèques distincts sont admis, chacun avec ses infos', () => {
    const { parts, valid } = resolvePayments([
        { method: 'Chèque', amount: '100', bank: 'BNP', cheque_number: '11' },
        { method: 'Chèque', amount: '', bank: 'LCL', cheque_number: '22' },
    ], 300);
    assert.ok(valid);
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[1].amount, 200, 'le second chèque prend le solde');
    assert.strictEqual(parts[0].bank, 'BNP');
    assert.strictEqual(parts[1].cheque_number, '22');
});

test('les infos de chèque ne s\'attachent pas à un autre moyen', () => {
    // Une banque saisie par erreur sur une ligne CB ne doit pas être conservée.
    const { parts } = resolvePayments([{ method: 'CB', amount: '', bank: 'X', cheque_number: 'Y' }], 80);
    assert.deepStrictEqual(parts, [{ method: 'CB', amount: 80 }]);
});

test('un chèque unique fait quand même stocker le détail', () => {
    // Sinon banque et numéro seraient perdus. La condition couvre « plus d'un moyen » OU « du
    // détail à conserver ».
    const src = net('controllers/sale.controller.js');
    assert.match(src, /const aDuDetail = parts\.some\(\(p\) => p\.bank \|\| p\.cheque_number\)/,
        'le détail d\'un chèque unique n\'est pas détecté');
    // Et côté saisie serveur, les champs ne sont lus que pour un chèque.
    assert.match(src, /if \(estCheque\(part\.method\)\)/, 'les infos de chèque ne sont pas restreintes au chèque');
});

// --- La validation côté serveur -------------------------------------------------------------

test('le serveur revérifie que la somme des paiements tombe sur le TTC', () => {
    // Le front peut se tromper ou être contourné : le contrôleur refuse une répartition qui ne
    // correspond pas au total. C'est la garde qui compte.
    const src = net('controllers/sale.controller.js');
    assert.match(src, /Math\.abs\(somme - ttc\) > 0\.01/, 'la somme n\'est pas comparée au TTC');
    assert.match(src, /ne correspond pas au total à régler/, 'aucun message clair de refus');
    // Vérifié seulement quand la vente est payée : une vente impayée n'a pas de règlement.
    assert.match(src, /status === 'PAYEE' && parts\.length/, 'la vérification n\'est pas conditionnée au paiement');
});

test('le détail n\'est stocké qu\'à partir de deux moyens, et si la colonne existe', () => {
    // Un paiement simple n'a pas besoin d'un JSON ; et sans la migration 116, la vente sort comme
    // avant plutôt que d'échouer.
    const src = net('controllers/sale.controller.js');
    assert.match(src, /if \(parts\.length > 1 \|\| aDuDetail\) paymentSplit = JSON\.stringify\(parts\)/, 'le détail multi-moyens n\'est pas conservé');
    assert.match(src, /hasColumn\(conn, 'invoice', 'payment_split'\)/, 'pas de garde de colonne');
    assert.match(src, /if \(hasInvSplit\) \{ iCol\.push\('payment_split'\)/, 'payment_split n\'est pas conditionné à la colonne');
});

test('le résumé du moyen de paiement reflète la répartition', () => {
    // « Espèces + CB » dans la colonne courte ; le détail chiffré est dans payment_split.
    const src = net('controllers/sale.controller.js');
    assert.match(src, /parts\.map\(\(p\) => p\.method\)\.join\(' \+ '\)/, 'le résumé ne liste pas les moyens');
});

test('la migration 116 existe avec son retour arrière', () => {
    const d = path.join(DIR, '..', '..', 'database', 'migrations');
    assert.match(fs.readFileSync(path.join(d, '116_invoice_payment_split.sql'), 'utf8'),
        /ADD COLUMN IF NOT EXISTS payment_split/, 'colonne absente');
    assert.ok(fs.existsSync(path.join(d, '116_revert_invoice_payment_split.sql')), 'revert manquant');
});
