/**
 * LA DATE DE NAISSANCE DANS LA PALETTE — signalé par l'école le 2026-09-22 : « il manque le jeton
 * de la date de naissance du stagiaire ».
 *
 * LE JETON EXISTAIT. {D_Naissance} est au catalogue depuis toujours, et `resolveTokens` le remplit
 * (JJ/MM/AAAA). Mais la palette de l'éditeur n'est pas le catalogue : son groupe « Stagiaire » se
 * construit depuis les Champs documents, et ceux-ci écartent les colonnes DATE (`sqlToType`,
 * lib/conditions.js). La date de naissance se remplissait donc si on la TAPAIT, et restait
 * introuvable pour qui compose son modèle — le même défaut que {Today} et les jetons d'évaluation
 * avant elle.
 */
const test = require('node:test');
const assert = require('node:assert');

/* UNE BASE FACTICE : la fiche `learner` telle que l'introspection la voit, et des Champs documents
   activés comme en production (prénom, nom, e-mail). Tout le reste répond vide. */
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

const col = (c, dt, ct = dt) => ({ t: 'learner', c, dt, ct, cm: '' });
async function palette() {
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await getTokens({ user: { organization_id: 'o1' }, query: {} }, res);
    return corps.data;
}

test('{D_Naissance} est proposé dans le groupe « Stagiaire » de la palette', async () => {
    colonnes = [col('first_name', 'varchar', 'varchar(80)'), col('last_name', 'varchar', 'varchar(80)'),
        col('email', 'varchar', 'varchar(160)'), col('birthday', 'date')];
    reglages = ['first_name', 'last_name', 'email', 'birthday'].map((c) => ({
        source_table: 'learner', column_name: c, enabled: 1, enabled_condition: 1, label: null }));
    const g = (await palette()).find((x) => x.group === 'Stagiaire');
    assert.ok(g, 'le groupe « Stagiaire » doit exister');
    const naissance = g.tokens.find((t) => t.key === 'D_Naissance');
    assert.ok(naissance, 'la date de naissance doit se trouver avec les autres données du stagiaire');
    assert.strictEqual(naissance.label, 'Date de naissance');
    /* LE JETON NOMMÉ, PAS UN CHAMP DOCUMENT : la colonne DATE n'en produit pas — et si elle en
       produisait un, il sortirait brut (« Tue Apr 15 1990… »), sans la mise en forme du jeton. */
    assert.ok(!g.tokens.some((t) => t.key === 'field:learner.birthday'),
        'la colonne DATE ne doit pas produire de champ document');
    assert.ok(g.tokens.some((t) => t.key === 'field:learner.first_name'), 'les Champs documents restent là');
});

test('le groupe se crée même quand aucun champ du stagiaire n\'est activé', async () => {
    /* Une école qui aurait tout désactivé dans « Champs documents » n'a plus de groupe « Stagiaire »
       issu des champs : la date de naissance ne doit pas disparaître avec lui. */
    colonnes = [col('birthday', 'date')];
    reglages = [];
    const g = (await palette()).find((x) => x.group === 'Stagiaire');
    assert.ok(g && g.tokens.some((t) => t.key === 'D_Naissance'));
});

test('le jeton se remplit en JJ/MM/AAAA', () => {
    const { resolveTokens } = require('../lib/tokens.js');
    assert.strictEqual(resolveTokens({ learner: { birthday: '1990-04-15' } }).D_Naissance, '15/04/1990');
});
