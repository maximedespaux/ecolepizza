/**
 * L'IDENTIFIANT FRANCE TRAVAIL CHIFFRÉ AU REPOS (migration 170, 2026-09-21, en urgence).
 *
 * `learner.france_travail_id` était stocké EN CLAIR — dans la base et dans chaque sauvegarde —,
 * alors que le n° de sécurité sociale, « de même nature » (lib/consentements.js), est chiffré
 * depuis longtemps. Il l'est désormais aussi : même clé, même code. CHIFFRÉ et non haché, parce
 * qu'il se relit (fiche, jeton {France Travail}).
 *
 * Ce fichier gèle ce qui rend la bascule SÛRE, et pas seulement faite :
 *   · on n'écrit chiffré que dans une colonne qui a la place (sinon : échec, ou chiffré TRONQUÉ,
 *     à jamais illisible) — avant la 170, le clair continue comme avant ;
 *   · tout ce qui LIT rend le clair : la fiche, le jeton, la facture — et un identifiant resté en
 *     clair passe tel quel ;
 *   · la reprise des valeurs existantes ne remplace jamais une valeur par ce qu'elle ne sait pas
 *     rouvrir, ni une fiche modifiée entre sa lecture et son écriture.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base (même montage que stagiaire-note-libre) ────────────────────────────────────
let requetes = [];
let largeur = 255;
let fiche = null;
const COLONNES = ['first_name', 'last_name', 'email', 'phone', 'financing', 'france_travail_id', 'social_security'];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/CHARACTER_MAXIMUM_LENGTH/.test(sql)) return [[{ n: largeur }]];
            if (/information_schema\.columns[\s\S]*column_name = \?/.test(sql)) return [COLONNES.includes(params[1]) ? [{ 1: 1 }] : []];
            if (/information_schema\.columns/.test(sql)) return [COLONNES.map((c) => ({ c }))];
            if (/SELECT company_id, financing, user_id, email FROM learner/.test(sql)) return [[{ company_id: null, financing: 'PARTICULIER', user_id: null, email: 'marie@exemple.fr' }]];
            if (/SELECT \* FROM learner WHERE id = \?/.test(sql)) return [fiche ? [fiche] : []];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
    end: async () => {},
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false },
};

const { encrypt, decrypt } = require('../lib/crypto.js');
const { createLearner, updateLearner, getLearner } = require('../controllers/learner.controller.js');
const { resolveTokens } = require('../lib/tokens.js');
const outil = require('../../../database/tools/chiffrer-france-travail.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: { id: 'l1' }, query: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const FICHE = { first_name: 'Marie', last_name: 'DUPONT', email: 'marie@exemple.fr', phone: '0612345678', financing: 'PARTICULIER' };
function valeurDe(q, colonne) {
    const set = q.sql.slice(q.sql.indexOf('SET') + 3, q.sql.lastIndexOf('WHERE'));
    const parties = set.split(/,\s*(?![^()]*\))/).map((x) => x.trim());
    const i = parties.findIndex((x) => x.startsWith(`${colonne} = ?`));
    assert.ok(i >= 0, `« ${colonne} » absent de l'UPDATE`);
    return q.params[parties.slice(0, i).reduce((n, x) => n + (x.match(/\?/g) || []).length, 0)];
}
const maj = () => requetes.find((q) => /^\s*UPDATE learner SET/.test(q.sql));

// ── L'écriture ─────────────────────────────────────────────────────────────────────────────
test('APRÈS LA 170 : l\'identifiant s\'écrit CHIFFRÉ, et se rouvre à l\'identique', async () => {
    requetes = []; largeur = 255;
    const { code } = await appeler(updateLearner, { body: { ...FICHE, france_travail_id: ' 1234567A ' } });
    assert.strictEqual(code, 200);
    const stocke = valeurDe(maj(), 'france_travail_id');
    assert.match(stocke, /^enc:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/, 'jamais le clair dans la base');
    assert.strictEqual(decrypt(stocke), '1234567A', 'bords retirés, rien d\'autre');
    assert.ok(stocke.length <= 255);
    // Le n° de sécurité sociale, lui, l'était déjà : rien ne change pour lui.
    requetes = [];
    await appeler(updateLearner, { body: { ...FICHE, social_security: '1 85 07 65 123 456 78' } });
    assert.match(valeurDe(maj(), 'social_security'), /^enc:/);
});

test('AVANT LA 170 : la colonne n\'a pas la place — on écrit en clair, comme avant', async () => {
    /* Un chiffré (~80 caractères) dans 60 : échec en mode strict, TRONQUÉ sans erreur sinon — et
       un chiffré tronqué ne se rouvre jamais. L'outil reprendra ces valeurs une fois la 170 jouée. */
    requetes = []; largeur = 60;
    await appeler(updateLearner, { body: { ...FICHE, france_travail_id: '1234567A' } });
    assert.strictEqual(valeurDe(maj(), 'france_travail_id'), '1234567A');
    largeur = 255;
});

test('À LA CRÉATION aussi, et le vider l\'efface (NULL)', async () => {
    requetes = []; largeur = 255;
    const { code } = await appeler(createLearner, { body: { ...FICHE, france_travail_id: '7654321B' } });
    assert.strictEqual(code, 201);
    const ins = requetes.find((q) => /INSERT INTO learner/.test(q.sql));
    const cols = ins.sql.slice(ins.sql.indexOf('user_id,') + 8, ins.sql.indexOf(')')).split(',').map((c) => c.trim());
    const chiffre = ins.params[4 + cols.indexOf('france_travail_id')];
    assert.strictEqual(decrypt(chiffre), '7654321B');
    assert.match(chiffre, /^enc:/);
    requetes = [];
    await appeler(updateLearner, { body: { ...FICHE, france_travail_id: '' } });
    assert.strictEqual(valeurDe(maj(), 'france_travail_id'), null);
});

test('un identifiant trop long pour tenir chiffré est refusé, avant la base', async () => {
    for (const v of ['X'.repeat(61), 'é'.repeat(49)]) { // 61 caractères / 98 octets
        requetes = [];
        const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, france_travail_id: v } });
        assert.strictEqual(code, 422);
        assert.match(corps.error, /France Travail est trop long/);
        assert.strictEqual(requetes.length, 0);
    }
});

// ── La lecture ─────────────────────────────────────────────────────────────────────────────
test('LA FICHE REND LE CLAIR — chiffré ou resté en clair', async () => {
    for (const [stocke, attendu] of [[encrypt('1234567A'), '1234567A'], ['9999999Z', '9999999Z'], [null, null]]) {
        fiche = { id: 'l1', first_name: 'Marie', france_travail_id: stocke, social_security: null, company_id: null };
        const { corps } = await appeler(getLearner, {});
        assert.strictEqual(corps.data.france_travail_id, attendu);
    }
});

test('LE JETON {France Travail} IMPRIME LE CLAIR, jamais « enc:… »', () => {
    assert.strictEqual(resolveTokens({ learner: { france_travail_id: encrypt('1234567A') } })['France Travail'], '1234567A');
    assert.strictEqual(resolveTokens({ learner: { france_travail_id: '1234567A' } })['France Travail'], '1234567A', 'en clair : tel quel');
    assert.strictEqual(resolveTokens({ learner: { france_travail_id: 'enc:00:00:00' } })['France Travail'], '', 'illisible : vide, pas du charabia');
});

test('la facture relit l\'identifiant de l\'acheteur en clair', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'invoice.controller.js'), 'utf8');
    assert.match(src, /row: \{ \.\.\.l\[0\], france_travail_id: decrypt\(l\[0\]\.france_travail_id\) \}/);
    assert.match(src, /const \{ decrypt \} = require\('\.\.\/lib\/crypto\.js'\);/);
});

// ── La reprise des valeurs existantes ──────────────────────────────────────────────────────
function connOutil({ lignes = [], largeurCol = 255, affectees = 1 } = {}) {
    const ecrit = [];
    return {
        ecrit,
        query: async (sql, params) => {
            if (/CHARACTER_MAXIMUM_LENGTH/.test(sql)) return [[{ n: largeurCol }]];
            if (/^UPDATE learner SET france_travail_id/.test(sql)) { ecrit.push(params); return [{ affectedRows: affectees }]; }
            if (/NOT LIKE 'enc:%'/.test(sql)) return [lignes.filter((l) => !String(l.v).startsWith('enc:'))];
            if (/LIKE 'enc:%'/.test(sql)) return [lignes.filter((l) => String(l.v).startsWith('enc:'))];
            return [lignes];
        },
    };
}

test('LA REPRISE chiffre ce qui est en clair, vérifie l\'aller-retour, et saute le déjà chiffré', async () => {
    const deja = encrypt('5555555C');
    const conn = connOutil({ lignes: [{ id: 'l1', v: '1234567A' }, { id: 'l2', v: 'ABC 12' }, { id: 'l3', v: deja }] });
    const b = await outil.chiffrer(conn, { essai: false });
    assert.deepStrictEqual({ vus: b.vus, chiffres: b.chiffres, echecs: b.echecs }, { vus: 2, chiffres: 2, echecs: [] });
    for (const [chiffre, id, ancien] of conn.ecrit) {
        assert.match(chiffre, /^enc:/);
        assert.strictEqual(decrypt(chiffre), ancien, `${id} : se rouvre à l'identique`);
    }
    // L'écriture n'a lieu que si la fiche n'a pas changé depuis la lecture.
    assert.deepStrictEqual(conn.ecrit.map((p) => p.slice(1)), [['l1', '1234567A'], ['l2', 'ABC 12']]);
});

test('en essai, RIEN ne s\'écrit ; une fiche modifiée entre-temps n\'est pas écrasée', async () => {
    const essai = connOutil({ lignes: [{ id: 'l1', v: '1234567A' }] });
    assert.strictEqual((await outil.chiffrer(essai, { essai: true })).chiffres, 1);
    assert.strictEqual(essai.ecrit.length, 0);
    const concurrente = connOutil({ lignes: [{ id: 'l1', v: '1234567A' }], affectees: 0 });
    assert.deepStrictEqual((await outil.chiffrer(concurrente, { essai: false })).echecs, ['l1']);
});

test('--verifier compte, sans rien écrire ; --dechiffrer ne remplace jamais par du vide', async () => {
    const conn = connOutil({ lignes: [{ id: 'l1', v: encrypt('1234567A') }, { id: 'l2', v: 'CLAIR' }, { id: 'l3', v: 'enc:00:00:00' }] });
    assert.deepStrictEqual(await outil.verifier(conn), { chiffres: 1, clairs: 1, illisibles: ['l3'] });
    assert.strictEqual(conn.ecrit.length, 0);
    const d = await outil.dechiffrer(conn, { essai: false });
    assert.deepStrictEqual({ dechiffres: d.dechiffres, illisibles: d.illisibles }, { dechiffres: 1, illisibles: ['l3'] });
    assert.deepStrictEqual(conn.ecrit.map((p) => p.slice(0, 2)), [['1234567A', 'l1']], 'l\'illisible reste tel quel');
});

test('l\'outil refuse d\'écrire tant que la colonne n\'a pas la place, et confronte la clé d\'abord', async () => {
    assert.strictEqual(await outil.colonnePrete(connOutil({ largeurCol: 60 })), false);
    assert.strictEqual(await outil.colonnePrete(connOutil({ largeurCol: 255 })), true);
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database', 'tools', 'chiffrer-france-travail.js'), 'utf8');
    const principal = src.slice(src.indexOf('if (require.main === module)'));
    const cle = principal.indexOf('await cleConfirmee(conn');
    assert.ok(cle > 0 && cle < principal.indexOf('await colonnePrete(conn)') && cle < principal.indexOf('await chiffrer(conn)'),
        'la clé est confrontée à une valeur déjà chiffrée AVANT toute écriture');
    assert.match(src, /const \{ cleConfirmee \} = require\('\.\/chiffrer-coffre\.js'\);/, 'le garde-fou du coffre, pas une copie');
    assert.doesNotMatch(principal, /console\.log\([^)]*\b(r\.v|clair|chiffre)\b/, 'aucun identifiant n\'est affiché');
});

// ── La migration ───────────────────────────────────────────────────────────────────────────
test('LA 170 élargit la colonne ; son revert NE LA RÉTRÉCIT PAS', () => {
    const M = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(M, '170_france_travail_chiffre.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(M, '170_revert_france_travail_chiffre.sql'), 'utf8');
    assert.match(aller, /ALTER TABLE learner\s+MODIFY COLUMN france_travail_id VARCHAR\(255\) DEFAULT NULL;/);
    /* Rétrécir couperait les chiffrés (environ 80 caractères) — à jamais illisibles. Le retour au
       clair passe par l'outil, --dechiffrer. */
    assert.doesNotMatch(retour, /MODIFY COLUMN/);
    assert.match(retour, /--dechiffrer/);
    assert.match(retour, /DO 0;/);
    for (const f of [aller, retour]) {
        assert.strictEqual((f.match(/;/g) || []).length, 1, 'un seul « ; », en fin d\'instruction (cf. la 146)');
        assert.ok(!f.includes('\\'));
    }
});
