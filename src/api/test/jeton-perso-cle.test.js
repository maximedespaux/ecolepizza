/**
 * LA CLÉ D'UN JETON PERSONNALISÉ EST UN IDENTIFIANT — relevé le 2026-09-26 en auditant les jetons de
 * production.
 *
 * LE DÉFAUT. Quatre modèles — le devis particulier, le devis professionnel, la convention et le
 * contrat — portaient une puce {custom:Acomtpe}. Le jeton de l'organisme s'appelait « Acompte » : sa clé,
 * saisie « Acomtpe », avait été corrigée dans la fenêtre des jetons personnalisés, qui remplace la
 * liste d'un bloc. Rien n'avait suivi dans les modèles, et une puce dont la clé ne désigne plus rien
 * s'imprime VIDE, sans une erreur : « Joindre votre règlement de  € », « un paiement de  € ».
 *
 * TROIS RÉPONSES, gelées ici :
 *   · le serveur REFUSE de retirer une clé qu'un modèle — ou un autre jeton personnalisé — emploie ;
 *   · la fenêtre ne laisse plus modifier la clé d'un jeton enregistré (le libellé, si) ;
 *   · la migration 183 fait pointer les puces orphelines de production vers le jeton qui existe.
 * (L'éditeur, lui, barre et nomme toute puce qui ne désigne plus rien : palette-complete.test.js.)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let existants = [];
let modeles = [];
let ecritures = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            const q = sql.replace(/\s+/g, ' ');
            if (/^SELECT token_key, label, category, template, sort_order FROM custom_token/.test(q)) return [existants];
            if (/FROM document_template WHERE organization_id = \? AND deleted = 0/.test(q)) return [modeles];
            if (/^(DELETE|INSERT)/.test(q)) { ecritures.push([q.split(' ')[0], params]); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { saveCustomTokens } = require('../controllers/template.controller.js');

const ACOMPTE = { token_key: 'Acompte', label: 'Acompte de la formation (30%)', category: 'Formation', template: '{field:training_program.price|*0.30}' };
const PERIODE = { token_key: 'Periode', label: 'Periode de la formation', category: 'Session', template: "Du {Jour1} jusqu'au {endDate}" };
const puce = (cle) => `<span class="doc-token" contenteditable="false" data-token="custom:${cle}" data-label="x">x</span>`;

async function enregistrer(tokens) {
    ecritures = [];
    let code = 200, corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await saveCustomTokens({ user: { organization_id: 'o1', id: 'u1' }, body: { tokens }, headers: {}, ip: '127.0.0.1' }, res);
    return { code, corps };
}

test('RENOMMER la clé d\'un jeton employé est REFUSÉ, et la réponse nomme les modèles', async () => {
    existants = [ACOMPTE, PERIODE];
    modeles = [
        { slug: 'convention', label: 'Convention', body_html: `<p>un paiement de ${puce('Acompte')} €</p>`, header_html: null, footer_html: null },
        { slug: 'contrat', label: 'Contrat', body_html: '<p>rien</p>', header_html: null, footer_html: `<p>{custom:Acompte|+0}</p>` },
        { slug: 'cgv', label: 'CGV', body_html: '<p>rien</p>', header_html: null, footer_html: null },
    ];
    const { code, corps } = await enregistrer([{ ...ACOMPTE, token_key: 'Acompte_30' }, PERIODE]);
    assert.strictEqual(code, 409);
    assert.deepStrictEqual(corps.employes, [{ cle: 'Acompte', ou: ['Convention', 'Contrat'] }],
        'en puce comme en texte, dans le corps comme dans le pied — et pas les CGV, qui ne l\'emploient pas');
    assert.match(corps.message, /\{custom:Acompte\} — Convention, Contrat/);
    assert.deepStrictEqual(ecritures, [], 'rien n\'est écrit : la liste d\'avant reste en place');
});

test('changer le LIBELLÉ, ou retirer un jeton que personne n\'emploie, reste libre', async () => {
    existants = [ACOMPTE, PERIODE];
    modeles = [{ slug: 'convention', label: 'Convention', body_html: puce('Acompte'), header_html: '', footer_html: '' }];
    let r = await enregistrer([{ ...ACOMPTE, label: 'Acompte (30 %)' }, PERIODE]);
    assert.strictEqual(r.code, 200);
    assert.ok(ecritures.some(([op, p]) => op === 'INSERT' && p.includes('Acompte (30 %)')));
    r = await enregistrer([ACOMPTE]);
    assert.strictEqual(r.code, 200, '{custom:Periode} n\'est employé nulle part');
});

test('un jeton qu\'un AUTRE jeton personnalisé cite ne se retire pas non plus', async () => {
    existants = [ACOMPTE, PERIODE];
    modeles = [];
    const RESTE = { token_key: 'Reste', label: 'Reste à payer', category: '', template: 'Reste : {custom:Acompte|*233,33%}' };
    const { code, corps } = await enregistrer([PERIODE, RESTE]);
    assert.strictEqual(code, 409);
    assert.deepStrictEqual(corps.employes, [{ cle: 'Acompte', ou: ['le jeton « Reste à payer »'] }]);
});

test('LA FENÊTRE ne laisse plus modifier la clé d\'un jeton enregistré', () => {
    const FENETRE = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'CustomTokenManager.jsx'), 'utf8');
    assert.match(FENETRE, /\.map\(\(t\) => \(\{ \.\.\.t, existant: true \}\)\)/, 'les jetons chargés sont marqués « existants »');
    assert.match(FENETRE, /value=\{t\.token_key\} readOnly=\{!!t\.existant\}/, 'et leur clé se lit sans s\'écrire');
    /* Et « existant » ne part pas au serveur : l'enregistrement n'envoie que les quatre colonnes. */
    assert.match(FENETRE, /\(\{ token_key: slug\(t\.token_key\), label: t\.label \|\| slug\(t\.token_key\), category: t\.category \|\| "", template: t\.template \|\| "" \}\)/);
});

test('LA MIGRATION 183 fait pointer les puces orphelines vers le jeton qui existe — et seulement elles', () => {
    const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(MIG, '183_jeton_acompte.sql'), 'utf8');
    const sql = aller.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const zone of ['body_html', 'header_html', 'footer_html']) {
        assert.match(sql, new RegExp(`${zone}\\s*= REPLACE\\(REPLACE\\(${zone},\\s*'data-token="custom:Acomtpe"', 'data-token="custom:Acompte"'\\), '\\{custom:Acomtpe', '\\{custom:Acompte'\\)`),
            `${zone} : la puce ET la forme en texte`);
    }
    // Un organisme qui aurait encore un jeton « Acomtpe », ou pas de jeton « Acompte », n'est pas touché.
    assert.match(sql, /organization_id IN \(SELECT organization_id FROM custom_token WHERE token_key = 'Acompte'\)/);
    assert.match(sql, /organization_id NOT IN \(SELECT organization_id FROM custom_token WHERE token_key = 'Acomtpe'\)/);
    /* Ni point-virgule dans une chaîne, ni barre oblique inverse : le client SQL de l'organisme découpe
       sur le premier (la 146), et la seconde change de sens selon le mode du serveur (la 166). */
    const chaines = sql.match(/'[^']*'/g) || [];
    assert.ok(!chaines.some((c) => c.includes(';')), 'aucun point-virgule dans une chaîne');
    assert.ok(!sql.includes('\\'), 'aucune barre oblique inverse');
    assert.strictEqual((sql.match(/;/g) || []).length, 1, 'une seule instruction');
    // Son revert ne remet pas un blanc dans le contrat : il ne fait rien, et dit pourquoi.
    const retour = fs.readFileSync(path.join(MIG, '183_revert_jeton_acompte.sql'), 'utf8');
    assert.match(retour.replace(/\/\*[\s\S]*?\*\//g, '').trim(), /^DO 0;$/);
});
