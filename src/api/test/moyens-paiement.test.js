/**
 * LES MOYENS DE PAIEMENT du règlement (migration 195) — lib/moyensPaiement.js.
 *
 * L'école note COMMENT l'acompte et le solde ont été réglés (espèces, chèque, virement, carte), et,
 * pour un chèque ou un virement, le n° / la référence. La liste vit en DEUX exemplaires — serveur
 * (src/api/lib) et écran (src/app/ui/lib) — pour que la carte « Règlement » et la validation serveur
 * proposent exactement les mêmes moyens.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · les deux fichiers listent les MÊMES moyens (code, libellé, référence) — sinon l'écran offrirait
 *     un moyen que le serveur refuse, ou l'inverse ;
 *   · un chèque et un virement demandent une référence, les espèces et la carte non ;
 *   · le serveur accepte le vide et les moyens connus, refuse le reste (moyenValide).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const S = require('../lib/moyensPaiement.js');
const frontSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'moyensPaiement.js'), 'utf8');

// Extrait la liste [code, label, ref] d'un source (guillemets simples OU doubles ; ref null ou chaîne).
function extraireMoyens(src) {
    const bloc = /MOYENS\s*=\s*\[([\s\S]*?)\]/.exec(src);
    assert.ok(bloc, 'un tableau MOYENS doit être défini');
    const out = [];
    const re = /\{\s*code:\s*["']([^"']+)["'],\s*label:\s*["']([^"']+)["'],\s*ref:\s*(null|["']([^"']*)["'])\s*\}/g;
    let m;
    while ((m = re.exec(bloc[1]))) out.push([m[1], m[2], m[3] === 'null' ? null : m[4]]);
    return out;
}

test('LES DEUX FICHIERS proposent les mêmes moyens (écran ⇄ serveur)', () => {
    const cote = (arr) => arr.map((m) => [m.code, m.label, m.ref]);
    const serveur = cote(S.MOYENS);
    const ecran = extraireMoyens(frontSrc);
    assert.ok(serveur.length >= 4, 'au moins espèces, chèque, virement, carte');
    assert.deepStrictEqual(ecran, serveur, 'la liste de l\'écran doit être identique à celle du serveur');
    // Éprouvé aussi via le source serveur lu à plat : même garde-fou que pour l'écran.
    const serveurSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'moyensPaiement.js'), 'utf8');
    assert.deepStrictEqual(extraireMoyens(serveurSrc), serveur);
});

test('CHÈQUE ET VIREMENT demandent une référence ; espèces et carte, non', () => {
    assert.ok(S.refDemandee('CHEQUE'), 'un chèque a un n°');
    assert.ok(S.refDemandee('VIREMENT'), 'un virement a une référence');
    assert.strictEqual(S.refDemandee('ESPECES'), null);
    assert.strictEqual(S.refDemandee('CARTE'), null);
    assert.strictEqual(S.refDemandee(''), null);
    assert.strictEqual(S.refDemandee('XXX'), null, 'un moyen inconnu ne demande rien');
});

test('libelleMoyen : le libellé affiché, vide si absent ou inconnu', () => {
    assert.strictEqual(S.libelleMoyen('CHEQUE'), 'Chèque');
    assert.strictEqual(S.libelleMoyen('ESPECES'), 'Espèces');
    assert.strictEqual(S.libelleMoyen(''), '');
    assert.strictEqual(S.libelleMoyen(null), '');
    assert.strictEqual(S.libelleMoyen('XXX'), '', 'un code inconnu ne s\'imprime pas');
});

test('moyenValide : le vide et les moyens connus passent, le reste est refusé', () => {
    for (const ok of ['', null, undefined, 'ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE']) {
        assert.strictEqual(S.moyenValide(ok), true, `« ${ok} » doit être accepté`);
    }
    for (const ko of ['cheque', 'PAYPAL', 'CB', 'x']) {
        assert.strictEqual(S.moyenValide(ko), false, `« ${ko} » doit être refusé`);
    }
});
