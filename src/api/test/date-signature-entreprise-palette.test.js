/**
 * {Date de signature de l'entreprise} DANS LA PALETTE — pas seulement au catalogue.
 *
 * LE DÉFAUT, PAYÉ EN BOUCLE (évaluation, examen, {Today}, {Nombre stagiaires}, {D_Naissance}…) :
 * la palette de l'éditeur N'EST PAS le catalogue. Son groupe « Entreprise » se construit depuis les
 * Champs documents (colonnes de la fiche), qui ne connaissent pas un jeton NOMMÉ résolu depuis le
 * cadre `representant`. Ajouté au seul TOKEN_CATALOG, le jeton se remplissait si on le TAPAIT et
 * restait INTROUVABLE dans l'éditeur — exactement ce que l'école a signalé. Il doit donc être
 * poussé À LA MAIN dans le groupe « Entreprise » de la palette (getTokens).
 *
 * On appelle le VRAI `getTokens` sur une base factice (même montage que jeton-date-naissance).
 */
const test = require('node:test');
const assert = require('node:assert');

let colonnes = [];
let reglages = [];
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = sql.replace(/\s+/g, ' ');
            if (/FROM information_schema\.COLUMNS WHERE TABLE_SCHEMA = DATABASE\(\) AND TABLE_NAME IN/.test(q)) return [colonnes];
            if (/FROM condition_field WHERE organization_id/.test(q)) return [reglages];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getTokens } = require('../controllers/template.controller.js');

const colE = (c, dt, ct = dt) => ({ t: 'company', c, dt, ct, cm: '' });
async function palette() {
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await getTokens({ user: { organization_id: 'o1' }, query: {} }, res);
    return corps.data;
}

test('le jeton est proposé dans le groupe « Entreprise » de la palette', async () => {
    colonnes = [colE('name', 'varchar', 'varchar(255)'), colE('email', 'varchar', 'varchar(160)')];
    reglages = ['name', 'email'].map((c) => ({ source_table: 'company', column_name: c, enabled: 1, enabled_condition: 1, label: null }));
    const g = (await palette()).find((x) => x.group === 'Entreprise');
    assert.ok(g, 'le groupe « Entreprise » doit exister');
    const date = g.tokens.find((t) => t.key === 'Date signature entreprise');
    assert.ok(date, 'la date de signature de l\'entreprise doit se trouver dans la palette, pas seulement au catalogue');
    assert.strictEqual(date.label, "Date de signature de l'entreprise");
});

test('il reste là même quand aucun champ de l\'entreprise n\'est activé', async () => {
    /* Une école qui aurait tout désactivé dans « Champs documents » n'a plus de groupe « Entreprise »
       issu des champs : le jeton ne doit pas disparaître avec lui (le groupe se crée au besoin). */
    colonnes = [colE('name', 'varchar', 'varchar(255)')];
    reglages = [];
    const g = (await palette()).find((x) => x.group === 'Entreprise');
    assert.ok(g && g.tokens.some((t) => t.key === 'Date signature entreprise'));
});
