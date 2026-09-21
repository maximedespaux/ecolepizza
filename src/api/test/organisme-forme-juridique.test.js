/**
 * L'ORGANISME : SA FORME JURIDIQUE DANS UNE LISTE EN CAPITALES, ET SA VILLE EN CAPITALES.
 *
 * Demandé le 2026-09-21 dans Paramètres → Organisme : « le statut de l'organisme, avec la liste de
 * toutes les possibilités — SAS, SARL… — en capitales, et la ville en capitales aussi ».
 *
 * CE QUI MANQUAIT : l'organisme n'avait pas de colonne de forme juridique. Le jeton {Forme
 * juridique organisme} existait, mais seule l'entité émettrice d'une FACTURE la portait : hors
 * facture, il sortait vide sur tous les documents. Et la ville de l'organisme échappait à la
 * règle des capitales posée pour les stagiaires et les entreprises (162) — « Lannemezan » sur le
 * papier à en-tête, « LANNEMEZAN » dans chaque fiche.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let requetes = [];
let absente = false;   // migration 167 non jouée : la colonne legal_status n'existe pas
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (absente && /UPDATE organization SET/.test(sql) && /legal_status = \?/.test(sql)) {
                const e = new Error('Unknown column'); e.code = 'ER_BAD_FIELD_ERROR'; throw e;
            }
            return [{ affectedRows: 1 }];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { updateOrganization } = require('../controllers/organization.controller.js');

async function enregistrer(body) {
    requetes = [];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await updateOrganization({ body, user: { organization_id: 'o1', id: 'u1', role: 'SUPER_ADMIN' }, headers: {}, ip: '127.0.0.1' }, res);
    const maj = requetes.filter((q) => /UPDATE organization SET/.test(q.sql)).pop();
    const champs = maj ? [...maj.sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]) : [];
    const valeurs = maj ? Object.fromEntries(champs.map((c, i) => [c, maj.params[i]])) : {};
    return { code, corps, valeurs };
}

test('LA VILLE ET LA FORME JURIDIQUE S\'ENREGISTRENT EN CAPITALES, quel que soit le chemin', async () => {
    absente = false;
    const { code, valeurs } = await enregistrer({ town: '  lannemezan ', legal_status: 'sas', legal_name: 'École Pizza' });
    assert.strictEqual(code, 200);
    assert.strictEqual(valeurs.town, 'LANNEMEZAN');
    assert.strictEqual(valeurs.legal_status, 'SAS');
    assert.strictEqual(valeurs.legal_name, 'École Pizza', 'la raison sociale garde sa casse');
    // Accents conservés, comme pour les stagiaires (« établissement public » → « ÉTABLISSEMENT PUBLIC »).
    assert.strictEqual((await enregistrer({ legal_status: 'établissement public' })).valeurs.legal_status, 'ÉTABLISSEMENT PUBLIC');
    // « Non renseignée » s'enregistre vide, pas en chaîne vide.
    assert.strictEqual((await enregistrer({ legal_status: '' })).valeurs.legal_status, null);
});

test('AVANT LA MIGRATION 167 : le reste s\'enregistre, et la forme juridique perdue est DITE', async () => {
    absente = true;
    const { code, corps, valeurs } = await enregistrer({ town: 'tarbes', legal_status: 'SARL' });
    absente = false;
    assert.strictEqual(code, 200);
    assert.strictEqual(valeurs.town, 'TARBES', 'la ville passe quand même');
    assert.ok(!('legal_status' in valeurs));
    assert.deepStrictEqual(corps.ignores, ['legal_status'], 'l\'écran doit pouvoir le dire');
});

test('LA LISTE : les formes juridiques françaises, en capitales, sans doublon', async () => {
    const { FORMES_JURIDIQUES } = await import('../../app/ui/lib/formesJuridiques.js');
    const codes = FORMES_JURIDIQUES.map(([c]) => c);
    for (const c of codes) {
        assert.strictEqual(c, c.toLocaleUpperCase('fr'), `« ${c} » doit être en capitales`);
        assert.ok(c.length <= 40, `« ${c} » dépasse la colonne (40)`);
    }
    assert.strictEqual(new Set(codes).size, codes.length, 'aucun doublon');
    for (const c of ['EI', 'MICRO-ENTREPRISE', 'EURL', 'SARL', 'SASU', 'SAS', 'SA', 'SCOP', 'ASSOCIATION LOI 1901']) {
        assert.ok(codes.includes(c), `${c} manque`);
    }
    assert.ok(FORMES_JURIDIQUES.every(([, libelle]) => libelle), 'chaque sigle a son libellé pour choisir');
});

test('L\'ÉCRAN : la ville en capitales dès la frappe, la forme juridique dans la liste', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Reglages.jsx'), 'utf8');
    assert.match(src, /const setVille = \(e\) => setForm\(\(p\) => \(\{ \.\.\.p, town: e\.target\.value\.toLocaleUpperCase\("fr"\) \}\)\);/);
    assert.match(src, /onChange=\{setVille\} placeholder="LANNEMEZAN"/, 'l\'exemple montre le format attendu');
    assert.match(src, /<SelectField label="Forme juridique" value=\{form\.legal_status \|\| ""\}/);
    assert.match(src, /\{FORMES_JURIDIQUES\.map\(\(\[code, libelle\]\) =>/);
    assert.match(src, /!FORMES_JURIDIQUES\.some\(\(\[c\]\) => c === form\.legal_status\)/, 'une valeur hors liste ne disparaît pas');
    assert.match(src, /r\?\.ignores\?\.includes\("legal_status"\)/, 'la perte est dite, pas tue');
});

test('LA MIGRATION 167 : la colonne, la ville déjà saisie, et le client SQL de l\'organisme', () => {
    const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(MIG, '167_organisme_forme_juridique.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(MIG, '167_revert_organisme_forme_juridique.sql'), 'utf8');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS legal_status VARCHAR\(40\) DEFAULT NULL/);
    // Comparaison sur les OCTETS : la collation ignore la casse (cf. la 162).
    assert.match(aller, /SET town = UPPER\(TRIM\(town\)\)\s+WHERE town IS NOT NULL\s+AND CAST\(town AS BINARY\) <> CAST\(UPPER\(TRIM\(town\)\) AS BINARY\);/);
    assert.match(retour, /DROP COLUMN IF EXISTS legal_status;/);
    // Un point-virgule par instruction, aucun ailleurs (la 146), aucune barre oblique inverse.
    assert.strictEqual((aller.match(/;/g) || []).length, 2);
    assert.strictEqual((retour.match(/;/g) || []).length, 1);
    for (const sql of [aller, retour]) assert.ok(!sql.includes('\\'));
    // Et le jeton trouve enfin sa valeur hors facture, sous un libellé lisible dans Champs documents.
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'conditions.js'), 'utf8'),
        /'organization\.legal_status': "Forme juridique de l'organisme"/);
});
