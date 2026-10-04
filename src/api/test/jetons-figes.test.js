/**
 * LES DONNÉES D'UN DOCUMENT, FIGÉES À SON ÉMISSION (demandé le 2026-10-04, « URGENT »).
 *
 * Un document se rendait à chaque ouverture depuis les données VIVANTES du dossier : un devis émis
 * en mai, rouvert en octobre, se redatait d'octobre et aurait suivi tout changement de prix ou
 * d'adresse depuis. Une pièce émise ne doit plus bouger. `loadContext` (document.controller) fige
 * donc, à la PREMIÈRE lecture après l'émission (envoi ou signature), les données de fusion dans
 * `generated_document.jetons_figes` (JSON chiffré, migration 201), puis les SERT à la place des
 * données vivantes. Les signatures, les zones et le cachet de l'organisme restent vivants (ils se
 * complètent APRÈS l'envoi).
 *
 * CES TESTS GÈLENT :
 *   · un document DÉJÀ figé se rend avec les données figées, pas les vivantes ;
 *   · un document émis, pas encore figé, se CRISTALLISE (une écriture de `jetons_figes`) ;
 *   · un BROUILLON (ni envoyé ni signé) ne se fige pas et reste vivant.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { encrypt } = require('../lib/crypto.js');
const { frDate } = require('../lib/tokens.js');

// ── Fausse base pilotable : un organisme, un document émis, son modèle, une formation vivante ──
let etat;
let updates;      // les UPDATE vus (pour repérer la cristallisation de jetons_figes)
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/^\s*UPDATE/i.test(sql)) { updates.push(sql); return [{ affectedRows: 1 }]; }
            if (/FROM organization WHERE id = \?/.test(sql)) return [[{ id: 'o1', legal_name: 'École Pizza', signature_image: null }]];
            if (/SELECT org_signature_data, template_slug, type, sent_at, signed_at FROM generated_document/.test(sql)) {
                return [[{ org_signature_data: null, template_slug: 'devis', type: 'DEVIS', sent_at: etat.sent_at, signed_at: etat.signed_at }]];
            }
            if (/SELECT jetons_figes FROM generated_document/.test(sql)) return [[{ jetons_figes: etat.jetons_figes }]];
            if (/FROM document_formation df/.test(sql)) return [etat.formationsVivantes];
            if (/FROM document_template WHERE organization_id = \? AND slug = \?/.test(sql)) {
                return [[{ kind: 'builder', body_html: '<p>{Formation} — {Today}</p>', header_html: '', footer_html: '', layout: null }]];
            }
            return [[]]; // tout le reste du dossier est vide : seuls la formation et la date comptent ici
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { renderDocumentHtml } = require('../controllers/document.controller.js');

async function rendre() {
    updates = [];
    const erreurs = console.error; console.error = () => {};
    try {
        return await renderDocumentHtml(faux.promise(), 'o1',
            { id: 'd1', learner_id: null, template_slug: 'devis', title: 'Devis', type: 'DEVIS' });
    } finally { console.error = erreurs; }
}

test('un document DÉJÀ figé se rend avec les données figées, pas les vivantes', async () => {
    const bundle = { learner: {}, company: null,
        formations: [{ title: 'NIVEAU 1 (figé)' }], fields: {}, groupStagiaires: null,
        financeur: null, figeLe: '2026-05-18 09:00:00' };
    etat = { sent_at: '2026-05-18 09:00:00', signed_at: null, jetons_figes: encrypt(JSON.stringify(bundle)),
        formationsVivantes: [{ title: 'INTITULÉ MODIFIÉ DEPUIS' }] };
    const html = await rendre();
    assert.ok(html.includes('NIVEAU 1 (figé)'), 'l\'intitulé figé doit être servi');
    assert.ok(!html.includes('INTITULÉ MODIFIÉ DEPUIS'), 'jamais la donnée vivante modifiée depuis');
    assert.ok(html.includes('18/05/2026'), 'la date figée, pas celle du jour');
    assert.ok(!updates.some((u) => /jetons_figes/.test(u)), 'déjà figé : on ne réécrit rien');
});

test('un document émis mais pas encore figé se CRISTALLISE (une écriture), puis sert cette donnée', async () => {
    etat = { sent_at: '2026-05-18 09:00:00', signed_at: null, jetons_figes: null,
        formationsVivantes: [{ title: 'NIVEAU 1 CLASSIQUE' }] };
    const html = await rendre();
    const w = updates.find((u) => /UPDATE generated_document SET jetons_figes = \? WHERE id = \? AND jetons_figes IS NULL/.test(u));
    assert.ok(w, 'la première lecture après émission écrit jetons_figes, une seule fois, sous IS NULL');
    assert.ok(html.includes('NIVEAU 1 CLASSIQUE'), 'elle sert la donnée qu\'elle vient de figer');
    assert.ok(html.includes('18/05/2026'), 'et la date d\'envoi, pas celle du jour');
});

test('un BROUILLON (ni envoyé ni signé) ne se fige pas et reste vivant', async () => {
    etat = { sent_at: null, signed_at: null, jetons_figes: null,
        formationsVivantes: [{ title: 'BROUILLON EN COURS' }] };
    const html = await rendre();
    assert.ok(!updates.some((u) => /jetons_figes/.test(u)), 'un brouillon ne se fige pas');
    assert.ok(html.includes('BROUILLON EN COURS'));
    assert.ok(html.includes(frDate(new Date())), 'sa date reste vivante tant qu\'il n\'est pas émis');
});

/* LE CÂBLAGE, lu au source — la règle du dépôt pour les contrats non devinables. */
test('loadContext fige hors organisme et signatures, et épargne l\'émargement', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    assert.match(src, /docType !== 'EMARGEMENT'/, 'une feuille d\'émargement n\'est pas figée ici');
    assert.match(src, /SET jetons_figes = \? WHERE id = \? AND jetons_figes IS NULL/, 'écriture idempotente');
    // L'instantané figé ne porte PAS l'organisme (l'émetteur, le logo restent vivants).
    const bloc = src.slice(src.indexOf('Première lecture après émission'), src.indexOf('jetons_figes IS NULL'));
    assert.doesNotMatch(bloc, /\borg:/, 'l\'organisme n\'est pas figé dans l\'instantané');
    assert.match(bloc, /learner: learner \|\| \{\}, company:/);
});

test('la migration 201 existe, avec son revert', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    assert.ok(fs.existsSync(path.join(dir, '201_document_jetons_figes.sql')));
    assert.ok(fs.existsSync(path.join(dir, '201_revert_document_jetons_figes.sql')));
    const sql = fs.readFileSync(path.join(dir, '201_document_jetons_figes.sql'), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS jetons_figes longtext/);
});
