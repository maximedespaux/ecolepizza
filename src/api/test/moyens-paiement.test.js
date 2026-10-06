/**
 * LES MOYENS DE PAIEMENT du règlement (migration 195) — lib/moyensPaiement.js.
 *
 * L'école note COMMENT l'acompte et le solde ont été réglés (espèces, chèque, virement, carte), et,
 * pour un chèque ou un virement, le n° / la référence. La liste vit en DEUX exemplaires — serveur
 * (src/api/lib) et écran (src/app/ui/lib) — pour que la carte « Règlement » et la validation serveur
 * proposent exactement les mêmes moyens.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · les deux fichiers listent les MÊMES moyens de REPLI / codes historiques (code, libellé, réf) ;
 *   · un chèque et un virement demandent une référence — au CODE comme au LIBELLÉ (heuristique) ;
 *   · `libelleMoyen` rend le libellé d'un code historique, et rend un libellé libre tel quel ;
 *   · `moyensConfigures` donne la liste de l'entité, sinon les quatre de repli ;
 *   · `moyenValide` accepte le vide, les codes historiques, et — avec la liste de l'entité — ses
 *     moyens ; il refuse le reste (élargi le 2026-10-06 : la carte propose les moyens de l'entité).
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

test('CHÈQUE ET VIREMENT demandent une référence (code OU libellé) ; le reste, non', () => {
    assert.ok(S.refDemandee('CHEQUE'), 'un chèque a un n°');
    assert.ok(S.refDemandee('VIREMENT'), 'un virement a une référence');
    // L'heuristique vaut aussi pour les LIBELLÉS de l'entité, accents et casse compris.
    assert.ok(S.refDemandee('Chèque'), 'le libellé « Chèque » aussi');
    assert.ok(S.refDemandee('Virement bancaire'), 'et « Virement bancaire »');
    assert.strictEqual(S.refDemandee('ESPECES'), null);
    assert.strictEqual(S.refDemandee('CARTE'), null);
    assert.strictEqual(S.refDemandee('CB'), null);
    assert.strictEqual(S.refDemandee('Prélèvement'), null);
    assert.strictEqual(S.refDemandee(''), null);
});

test('libelleMoyen : un code historique rend son libellé, un libellé se rend lui-même, vide si rien', () => {
    assert.strictEqual(S.libelleMoyen('CHEQUE'), 'Chèque');      // code historique → libellé
    assert.strictEqual(S.libelleMoyen('ESPECES'), 'Espèces');
    assert.strictEqual(S.libelleMoyen('CB'), 'CB');             // libellé de l'entité → lui-même
    assert.strictEqual(S.libelleMoyen('Prélèvement'), 'Prélèvement');
    assert.strictEqual(S.libelleMoyen(''), '');
    assert.strictEqual(S.libelleMoyen(null), '');
});

test('moyensConfigures : la liste de l\'entité, sinon les quatre de repli', () => {
    assert.deepStrictEqual(S.moyensConfigures('Espèces, CB , Virement'), ['Espèces', 'CB', 'Virement']);
    const repli = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire'];
    assert.deepStrictEqual(S.moyensConfigures(''), repli);
    assert.deepStrictEqual(S.moyensConfigures(null), repli);
    assert.deepStrictEqual(S.moyensConfigures('  ,  '), repli, 'une chaîne de séparateurs seuls = repli');
});

test('moyenValide : vide et codes historiques toujours ; les moyens de l\'entité avec la liste', () => {
    for (const ok of ['', null, undefined, 'ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE']) {
        assert.strictEqual(S.moyenValide(ok), true, `« ${ok} » doit être accepté`);
    }
    // Sans la liste de l'entité, un libellé libre est refusé : c'est le contrôleur qui fournit la liste.
    for (const ko of ['cheque', 'PAYPAL', 'CB', 'x']) {
        assert.strictEqual(S.moyenValide(ko), false, `« ${ko} » doit être refusé sans liste`);
    }
    // Avec la liste de l'entité, ses moyens passent ; un code historique passe toujours.
    const entite = ['Espèces', 'CB', 'Prélèvement'];
    assert.strictEqual(S.moyenValide('CB', entite), true);
    assert.strictEqual(S.moyenValide('Prélèvement', entite), true);
    assert.strictEqual(S.moyenValide('PAYPAL', entite), false, 'ce qui n\'est ni code ni moyen de l\'entité est refusé');
    assert.strictEqual(S.moyenValide('CHEQUE', entite), true, 'un code historique passe toujours');
});
