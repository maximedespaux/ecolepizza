/**
 * LES JETONS HISTORIQUES, RECONNUS PAR L'ÉDITEUR — « pourquoi y a-t-il des jetons non enregistrés
 * comme jetons ? Comme Nom complet », demandé le 2026-09-26 sur le devis RS7404.
 *
 * CE N'ÉTAIENT PAS DE NOUVEAUX JETONS. {Personne} (« Nom complet »), {Adresse}, {Date}, {Formation}
 * sont au catalogue depuis toujours, et les documents les impriment. Mais la palette de l'éditeur
 * n'est pas le catalogue : son groupe « Stagiaire » se construit depuis les Champs documents, et
 * seuls quelques jetons nommés y avaient été rajoutés à la main ({D_Naissance}). Or l'éditeur tire la
 * CATÉGORIE d'une puce — sa couleur — de la palette : un jeton qu'elle ne liste pas y paraît inconnu.
 *
 * DEUX CAS, DEUX RÉPONSES :
 *   · « Nom complet » et « Adresse complète » n'ont AUCUN champ équivalent : ils reviennent dans le
 *     groupe « Stagiaire », où l'on peut de nouveau les insérer ;
 *   · les autres ont leur champ ({Date} vaut {Today}, {Civilité} vaut le champ Civilité…) : ils sont
 *     RECONNUS, à part (`connus`), sans revenir en double dans la palette.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* Une base factice : la fiche `learner` telle que l'introspection la voit, et des Champs documents
   activés comme en production. Tout le reste répond vide. */
const col = (c, dt, ct = dt) => ({ t: 'learner', c, dt, ct, cm: '' });
const colonnes = [col('civility', 'varchar', 'varchar(10)'), col('first_name', 'varchar', 'varchar(80)'),
    col('last_name', 'varchar', 'varchar(80)'), col('address', 'varchar', 'varchar(255)'), col('email', 'varchar', 'varchar(160)')];
const reglages = ['civility', 'first_name', 'last_name', 'address', 'email'].map((c) => ({
    source_table: 'learner', column_name: c, enabled: 1, enabled_condition: 1, label: null }));
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
const { TOKEN_CATALOG } = require('../lib/tokens.js');

async function catalogue() {
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await getTokens({ user: { organization_id: 'o1' }, query: {} }, res);
    return corps;
}
const cles = (groupes) => new Set(groupes.flatMap((g) => (g.tokens || []).map((t) => t.key)));

test('« Nom complet » et « Adresse complète » se proposent de nouveau dans le groupe « Stagiaire »', async () => {
    const { data } = await catalogue();
    const stagiaire = data.find((g) => g.group === 'Stagiaire');
    assert.ok(stagiaire, 'le groupe « Stagiaire » existe');
    const libelle = (k) => (stagiaire.tokens.find((t) => t.key === k) || {}).label;
    assert.strictEqual(libelle('Personne'), 'Nom complet', 'civilité, prénom et NOM : aucun champ ne le donne');
    assert.strictEqual(libelle('Adresse'), 'Adresse complète', 'rue, code postal et ville sur une ligne');
    assert.ok(stagiaire.tokens.some((t) => t.key === 'field:learner.last_name'), 'les Champs documents restent là');
    assert.ok(!stagiaire.tokens.some((t) => t.key === 'Civilité' || t.key === 'Nom'),
        'pas de doublon d\'un champ document : {Civilité}, {Nom} ont leur champ');
});

test('les autres jetons historiques sont RECONNUS, sans revenir en double dans la palette', async () => {
    const { data, connus } = await catalogue();
    assert.ok(Array.isArray(connus), 'la réponse dit ce qu\'elle connaît sans le proposer');
    const offerts = cles(data);
    const reconnus = new Map(connus.flatMap((g) => g.tokens.map((t) => [t.key, g.group])));
    // Le devis RS7404 : {Date} (= {Today}) et {Formation}, dans leur famille.
    assert.ok(!offerts.has('Date') && offerts.has('Today'), '{Today} seul dans la palette : même valeur que {Date}');
    assert.strictEqual(reconnus.get('Date'), 'Dates et valeurs calculées', 'sous le nom que la palette donne au groupe');
    assert.strictEqual(reconnus.get('Formation'), 'Formation');
    // Rien n'est à la fois proposé et « connu à part » — et TOUT le catalogue est l'un ou l'autre.
    for (const k of reconnus.keys()) assert.ok(!offerts.has(k), `${k} en double`);
    for (const g of TOKEN_CATALOG) {
        for (const t of g.tokens || []) assert.ok(offerts.has(t.key) || reconnus.has(t.key), `{${t.key}} (${g.group}) inconnu de l'éditeur`);
    }
});

test('l\'éditeur les colore dans leur famille — ils n\'y paraissent plus inconnus', async () => {
    const { data, connus } = await catalogue();
    const couleurs = await import('../../app/ui/lib/categoryColors.js');
    // LE DÉFAUT : la palette seule ne connaît pas {Date} — la puce restait sans famille.
    couleurs.registerTokenGroups(data);
    assert.strictEqual(couleurs.chipStyleForKey('Date'), null);
    couleurs.registerTokenGroups([...data, ...connus]);
    for (const k of ['Personne', 'Adresse', 'Date', 'Formation']) assert.ok(couleurs.chipStyleForKey(k), `{${k}} a sa couleur`);
    assert.deepStrictEqual(couleurs.chipStyleForKey('Date'), couleurs.categoryChipStyle('Dates et valeurs calculées'));
    // Une puce déjà proposée garde SA famille : « connus » vient après, la première occurrence gagne.
    assert.deepStrictEqual(couleurs.chipStyleForKey('Personne'), couleurs.categoryChipStyle('Stagiaire'));
    const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');
    assert.match(EDITEUR, /registerTokenGroups\(\[\.\.\.\(cat\.data \|\| \[\]\), \.\.\.\(cat\.connus \|\| \[\]\)\]\);/);
});
