/**
 * LA PASTILLE « NOUVEAUX POSTS » DE LA COMMUNAUTÉ — pour le bureau ET le stagiaire (2026-10-05).
 *
 * Demandé : « quand un nouveau post est créé, une bulle avec un nombre, pour l'organisme et les
 * stagiaires ». Un seul compte partagé (`lib/communauteBadge.js`) : les posts parus DEPUIS la
 * dernière visite (`user.community_seen_at`, remis à NOW() en ouvrant la page), ses propres posts
 * exclus. Ce fichier gèle :
 *   · le compte (exclut les miens, se repère sur community_seen_at), et sa tolérance (table/colonne
 *     absente → 0, jamais une erreur de menu) ;
 *   · le bureau reçoit la pastille via /badges, EN PARALLÈLE des autres comptes (un aller-retour) ;
 *   · le stagiaire l'a aussi, fondue dans community_news ;
 *   · la barre du bureau recompte à l'instant où la Communauté s'ouvre (COMMUNITY_EVENT), sans
 *     attendre le sondage des 60 s.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => s.replace(/\s+/g, ' ').trim();

const { compterNouveauxPosts } = require('../lib/communauteBadge.js');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(900);

function base({ n = 0, jette = null, cap = [] }) {
    return {
        query: async (sql, params) => {
            cap.push({ sql: plat(sql), params });
            if (jette) { const e = new Error('absent'); e.code = jette; throw e; }
            return [[{ n }]];
        },
    };
}

test('compte les posts neufs, exclut les MIENS, se repère sur community_seen_at (contrat SQL)', async () => {
    const cap = [];
    const n = await compterNouveauxPosts(base({ n: 3, cap }), U(1), ORG);
    assert.equal(n, 3);
    const q = cap[0].sql;
    assert.match(q, /FROM community_post p/);
    assert.match(q, /p\.author_user_id <> u\.id/, 'mes propres posts ne me notifient pas');
    assert.match(q, /p\.created_at > COALESCE\(u\.community_seen_at, '1970-01-01'\)/, 'neuf = postérieur à ma dernière visite ; jamais venu = tout neuf');
    assert.deepEqual(cap[0].params, [U(1), ORG]);
});

test('table community_post (114) ou colonne community_seen_at (106) absente → 0', async () => {
    assert.equal(await compterNouveauxPosts(base({ jette: 'ER_NO_SUCH_TABLE' }), U(1), ORG), 0);
    assert.equal(await compterNouveauxPosts(base({ jette: 'ER_BAD_FIELD_ERROR' }), U(1), ORG), 0);
});

test('le BUREAU reçoit la pastille Communauté, en parallèle des autres comptes (/badges)', () => {
    const src = plat(lire('src/api/controllers/badges.controller.js'));
    assert.match(src, /compterNouveauxPosts\(conn, req\.user\.id, org\)/);
    assert.match(src, /'\/communaute': nouveauxPosts/);
    // Dans le Promise.all : un seul aller-retour, pas un await ajouté en file (cf. commentaire getBadges).
    assert.match(src, /await Promise\.all\(\[[\s\S]*compterNouveauxPosts[\s\S]*\]\)/);
});

test('le STAGIAIRE aussi : les nouveaux posts entrent dans community_news', () => {
    const src = plat(lire('src/api/controllers/espace.controller.js'));
    assert.match(src, /const posts = await compterNouveauxPosts\(conn, userId, orgId\)/);
    assert.match(src, /\(Number\(row\?\.comments\) \|\| 0\) \+ \(Number\(row\?\.likes\) \|\| 0\) \+ posts/);
});

test('la barre du bureau recompte dès l\'ouverture de la Communauté (COMMUNITY_EVENT)', () => {
    const side = lire('src/app/ui/components/Sidebar.jsx');
    assert.match(side, /COMMUNITY_EVENT/);
    assert.match(side, /addEventListener\(COMMUNITY_EVENT, load\)/);
    assert.match(side, /removeEventListener\(COMMUNITY_EVENT, load\)/, 'et on retire l\'écouteur au démontage');
});

test('la pastille ne demande AUCUNE migration (community_seen_at 106 et community_post 114 existent)', () => {
    // Garde-fou : si un jour quelqu'un croit devoir ajouter une migration pour ça, ce test le rappelle.
    const lib = lire('src/api/lib/communauteBadge.js');
    assert.match(lib, /community_post/);
    assert.match(lib, /community_seen_at/);
});
