/**
 * NUMÉRO DE TVA D'UNE ENTREPRISE : saisissable à la création, et contrôlé.
 *
 * L'ÉTAT TROUVÉ. La colonne existe depuis la migration 123, l'API la lit et l'écrit, et la FICHE
 * propose déjà le champ. Mais le formulaire de CRÉATION ne le portait pas : on ne pouvait le
 * renseigner qu'après coup, en rouvrant l'entreprise. Mesuré en production : quatre cent
 * soixante-neuf entreprises, AUCUNE avec un numéro.
 *
 * AUCUNE MIGRATION N'ÉTAIT DONC NÉCESSAIRE — ni pour la TVA, ni pour le téléphone, qui existe
 * dans le schéma d'origine et figure déjà partout, jusqu'au marqueur « obligatoire ». Écrire une
 * 147 qui ajoute des colonnes présentes aurait échoué, ou pire, semblé réussir.
 *
 * DEUX FORMES ACCEPTÉES, ET C'EST DÉLIBÉRÉ. La forme officielle française est « FR » suivi de
 * onze chiffres : c'est elle que les modèles donnent en exemple, et c'est elle que Factur-X
 * transmet sous `schemeID="VA"` — un identifiant intracommunautaire sans code pays n'y est pas
 * valide. Mais treize chiffres nus se lisent sur les documents que l'école reçoit, et les
 * refuser obligerait à deviner la transformation. On accepte les deux SANS jamais réécrire
 * l'une en l'autre : ajouter « FR » nous-mêmes reviendrait à inventer un pays.
 *
 * LE CHAMP RESTE FACULTATIF. L'exiger rendrait irréparables les quatre cent soixante-neuf fiches
 * déjà en base, toutes sans numéro — la même raison qui fait que `updateCompany` ne réclame pas
 * le SIRET.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');

let ecrits = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ COLUMN_NAME: 'vat_number' }]];
            if (/^\s*INSERT INTO company/i.test(sql)) { ecrits.push({ sql, params }); return [{}]; }
            if (/^\s*UPDATE company/i.test(sql)) { ecrits.push({ sql, params }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { createCompany } = require('../controllers/company.controller.js');

const COMPLET = {
    name: 'SARL Le Petit Four', siret: '87995513600012', email: 'contact@petitfour.fr',
    phone: '05 62 98 12 34', representative_name: 'Dupont',
};
function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
async function creer(vat) {
    ecrits = [];
    const res = reponse();
    const body = vat === undefined ? { ...COMPLET } : { ...COMPLET, vat_number: vat };
    await createCompany({ body, user: { organization_id: 'o1', id: 'u1' }, ip: '1.2.3.4', headers: {} }, res);
    return res;
}
/** Valeur écrite pour une colonne dans le dernier INSERT capté. */
function valeurEcrite(colonne) {
    const { sql, params } = ecrits[ecrits.length - 1];
    const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((c) => c.trim());
    const i = cols.indexOf(colonne);
    return i < 0 ? undefined : params[i];
}

test('la forme française officielle est acceptée', async () => {
    const res = await creer('FR76123456789');
    assert.strictEqual(res.code, 201, `attendu 201, reçu ${res.code} : ${JSON.stringify(res.corps)}`);
    assert.strictEqual(valeurEcrite('vat_number'), 'FR76123456789');
});

test('treize chiffres nus sont acceptés — c\'est ce qu\'on lit sur les factures reçues', async () => {
    const res = await creer('1234567890123');
    assert.strictEqual(res.code, 201);
    assert.strictEqual(valeurEcrite('vat_number'), '1234567890123');
});

test('espaces et minuscules sont normalisés, le pays n\'est JAMAIS inventé', async () => {
    const res = await creer(' fr 76 123456789 ');
    assert.strictEqual(res.code, 201);
    assert.strictEqual(valeurEcrite('vat_number'), 'FR76123456789');
    /* Et l'inverse ne se produit pas : treize chiffres restent treize chiffres. */
    await creer('1234567890123');
    assert.strictEqual(valeurEcrite('vat_number'), '1234567890123',
        'ajouter « FR » nous-mêmes reviendrait à inventer un pays');
});

test('une longueur fausse est refusée, avec le format attendu dans le message', async () => {
    for (const mauvais of ['FR7612345678', 'FR761234567890', '123456789012', '12345678901234']) {
        const res = await creer(mauvais);
        assert.strictEqual(res.code, 422, `${mauvais} aurait dû être refusé`);
        assert.match(res.corps.error, /treize caractères/i,
            'le refus doit dire ce qui est attendu, pas seulement que c\'est faux');
    }
});

test('une forme fantaisiste est refusée', async () => {
    for (const mauvais of ['DE123456789012', 'FRABCDEFGHIJK', 'TVA-123']) {
        const res = await creer(mauvais);
        assert.strictEqual(res.code, 422, `${mauvais} aurait dû être refusé`);
    }
});

test('le champ reste FACULTATIF', async () => {
    /* Quatre cent soixante-neuf fiches sont en base sans numéro : l'exiger les rendrait
       irréparables — on ne pourrait plus corriger un code postal sans inventer une TVA. */
    for (const vide of [undefined, '', '   ']) {
        const res = await creer(vide);
        assert.strictEqual(res.code, 201, `une entreprise sans TVA doit se créer (valeur ${JSON.stringify(vide)})`);
    }
});

test('un champ vidé efface la valeur au lieu d\'écrire une chaîne vide', async () => {
    await creer('   ');
    const v = valeurEcrite('vat_number');
    assert.ok(v === null || v === undefined,
        'une chaîne vide en base se confondrait avec un numéro renseigné mais illisible');
});

/* ------------------------------------------------------------------ contrats lus au source */

const RACINE = path.join(__dirname, '..', '..');
const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/company.controller.js'), 'utf8');
const CREATION = fs.readFileSync(path.join(RACINE, 'app/ui/pages/Entreprises.jsx'), 'utf8');
const FICHE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/EntrepriseDetail.jsx'), 'utf8');

test('le contrôle porte sur les DEUX chemins d\'écriture', () => {
    /* La fiche se corrige par `updateCompany` : n'contrôler qu'à la création laisserait entrer
       un numéro mal formé par la porte d'à côté, puis ressortir sur une facture Factur-X. */
    for (const fn of ['createCompany', 'updateCompany']) {
        const bloc = CTRL.slice(CTRL.indexOf(`const ${fn} = async`));
        const corps = bloc.slice(0, bloc.indexOf('\n};'));
        assert.match(corps, /erreurTva\(b\.vat_number\)/, `${fn} doit contrôler le numéro de TVA`);
    }
});

test('le champ est proposé à la création ET sur la fiche', () => {
    assert.match(CREATION, /value=\{f\.vat_number\}/, 'le formulaire de création doit porter le champ');
    assert.match(CREATION, /vat_number: ""/, 'et son état initial, sinon React le traite en non contrôlé');
    assert.match(FICHE, /k: "vat_number"/, 'la fiche le proposait déjà');
});
