// Plafonnement du panier boutique par le stock disponible.
//
// `qtyForItem` et `roomFor` sont PURES quand on leur passe explicitement les lignes : elles
// ne touchent ni localStorage ni window. On peut donc les importer telles quelles depuis le
// module front (src/app est en "type": "module", d'où l'import dynamique) et les tester sans
// navigateur ni DOM simulé.
//
// Ce qui est vérifié ici est la règle subtile : le stock se compte PAR ARTICLE, pas par ligne.
// Une veste en M et la même en L sont deux lignes de panier distinctes (la déclinaison fait
// partie de l'identité de la ligne) mais tirent sur le même article d'inventaire.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../app/ui/lib/cart.js');

// Une ligne de panier minimale (les champs de broderie sont sans effet ici).
const ligne = (id, qty, extra = {}) => ({ source: 'ECOLE', id, qty, ...extra });

test('qtyForItem additionne toutes les lignes du même article', async () => {
    const { qtyForItem } = await load();
    const panier = [
        ligne('veste', 1, { taille: 'M' }),
        ligne('veste', 2, { taille: 'L' }), // même article, autre déclinaison
        ligne('pelle', 5),
    ];
    assert.equal(qtyForItem(panier, 'ECOLE', 'veste'), 3);
    assert.equal(qtyForItem(panier, 'ECOLE', 'pelle'), 5);
    assert.equal(qtyForItem(panier, 'ECOLE', 'absent'), 0);
});

test('qtyForItem ne mélange pas école et partenaire', async () => {
    const { qtyForItem } = await load();
    const panier = [ligne('x', 2), { source: 'PARTENAIRE', id: 'x', qty: 7 }];
    assert.equal(qtyForItem(panier, 'ECOLE', 'x'), 2);
    assert.equal(qtyForItem(panier, 'PARTENAIRE', 'x'), 7);
});

test('roomFor : la place restante décompte ce qui est déjà au panier', async () => {
    const { roomFor } = await load();
    const art = { source: 'ECOLE', id: 'veste', stock: 3 };
    assert.equal(roomFor(art, []), 3);
    assert.equal(roomFor(art, [ligne('veste', 1)]), 2);
    assert.equal(roomFor(art, [ligne('veste', 3)]), 0);
});

test('roomFor : les déclinaisons d’un même article partagent le stock', async () => {
    const { roomFor } = await load();
    const art = { source: 'ECOLE', id: 'veste', stock: 2 };
    // 1 en M + 1 en L = les 2 vestes disponibles : plus de place, malgré deux lignes.
    const panier = [ligne('veste', 1, { taille: 'M' }), ligne('veste', 1, { taille: 'L' })];
    assert.equal(roomFor(art, panier), 0);
});

test('roomFor : jamais négatif si le stock a baissé sous le panier', async () => {
    const { roomFor } = await load();
    // Le stock relevé à l'ajout peut être périmé (réassort, autre stagiaire).
    const art = { source: 'ECOLE', id: 'veste', stock: 1 };
    assert.equal(roomFor(art, [ligne('veste', 4)]), 0);
});

test('roomFor : stock à 0 ne laisse aucune place', async () => {
    const { roomFor } = await load();
    assert.equal(roomFor({ source: 'ECOLE', id: 'x', stock: 0 }, []), 0);
});

test('roomFor : sans stock connu (partenaire), plafond à 99', async () => {
    const { roomFor } = await load();
    // Le partenaire vend son propre stock : on ne le connaît pas, on ne bloque pas.
    const art = { source: 'PARTENAIRE', id: 'four' };
    assert.equal(roomFor(art, []), 99);
    assert.equal(roomFor(art, [{ source: 'PARTENAIRE', id: 'four', qty: 90 }]), 9);
});

test('roomFor : le plafond de 99 s’applique aussi à un stock énorme', async () => {
    const { roomFor } = await load();
    assert.equal(roomFor({ source: 'ECOLE', id: 'x', stock: 5000 }, []), 99);
});
