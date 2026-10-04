/**
 * LA NEWSLETTER — une ANNONCE de la Communauté envoyée par e-mail aux stagiaires (2026-10-04).
 *
 * Modèle « soft opt-in client existant » : on écrit aux stagiaires de l'école SANS second « oui »,
 * mais chaque e-mail porte un lien de DÉSINSCRIPTION en un clic. Ce fichier gèle les défauts qui
 * feraient mal :
 *   · le jeton de désinscription ne vaut QUE pour ça — un jeton de session ne doit pas désinscrire
 *     (sécurité), et un jeton trafiqué est refusé ;
 *   · le PUBLIC exclut les comptes désactivés, les fiches sans e-mail, les doublons d'adresse, et
 *     surtout les DÉSINSCRITS — sinon la désinscription ne servirait à rien ;
 *   · CHAQUE e-mail a SON propre lien (deux stagiaires = deux jetons différents) ; un lien partagé
 *     désinscrirait tout le monde d'un clic ;
 *   · un envoi raté ne stoppe pas les autres, et ne fait jamais échouer la publication (fire-and-forget) ;
 *   · la désinscription s'écrit au registre des consentements (130), finalité 'newsletter', et
 *     cette finalité reste HORS de `FINALITES` (sinon elle redeviendrait une case « Oui » à cocher) ;
 *   · le GET public ne change RIEN (anti pré-chargement), seul le POST désinscrit.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-newsletter';
process.env.APP_URL = 'https://impastio.test';

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => s.replace(/\s+/g, ' ').trim();

const newsletter = require('../lib/newsletter.js');
const consentements = require('../lib/consentements.js');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(900);

/* ── Le jeton de désinscription ───────────────────────────────────────────────────────────────── */

test('le jeton se signe et se relit — et ne vaut QUE pour la désinscription', () => {
    const token = newsletter.signerLienDesinscription(U(1), ORG);
    const v = newsletter.verifierLienDesinscription(token);
    assert.deepEqual(v, { learnerId: U(1), orgId: ORG });

    // Un jeton de session (sans le bon « but ») ne désinscrit PAS, même signé avec le même secret.
    const sessionLike = jwt.sign({ id: U(1), role: 'STAGIAIRE' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal(newsletter.verifierLienDesinscription(sessionLike), null);

    // Un jeton d'un autre but est refusé.
    const autreBut = jwt.sign({ p: 'autre', l: U(1), o: ORG }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal(newsletter.verifierLienDesinscription(autreBut), null);

    // Trafiqué / vide / signé avec un autre secret → null, jamais une exception.
    assert.equal(newsletter.verifierLienDesinscription(token + 'x'), null);
    assert.equal(newsletter.verifierLienDesinscription(''), null);
    assert.equal(newsletter.verifierLienDesinscription(
        jwt.sign({ p: 'nl-unsub', l: U(1), o: ORG }, 'un-autre-secret', { algorithm: 'HS256' })), null);
});

/* ── Le corps de l'e-mail ─────────────────────────────────────────────────────────────────────── */

test('chaque e-mail porte le lien de désinscription (et un lien vers l\'espace)', () => {
    const token = newsletter.signerLienDesinscription(U(2), ORG);
    const corps = newsletter.corpsNewsletter('Fermeture exceptionnelle lundi.', token);
    assert.match(corps, /Fermeture exceptionnelle lundi\./);
    assert.match(corps, /\[Se désinscrire\]\(https:\/\/impastio\.test\/desinscription\//);
    assert.match(corps, new RegExp(`/desinscription/${token}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(corps, /\[Lire l'annonce dans mon espace\]\(https:\/\/impastio\.test\/communaute\)/);

    // Une annonce sans corps part quand même (titre + pied).
    const sansCorps = newsletter.corpsNewsletter('', token);
    assert.match(sansCorps, /Se désinscrire/);
});

/* ── Le public (audience) ─────────────────────────────────────────────────────────────────────── */

function baseAudience({ learners, desinscrits = [] }) {
    const requetes = [];
    return {
        requetes,
        query: async (sql) => {
            const q = plat(sql);
            requetes.push(q);
            if (/FROM learner l LEFT JOIN user u/.test(q)) return [learners];
            if (/FROM consent_record c JOIN/.test(q)) {
                return [desinscrits.map((id) => ({ learner_id: id, accorde: 0 }))];
            }
            throw new Error('requête inattendue : ' + q);
        },
    };
}

test('le public exclut les désinscrits et dédoublonne les adresses', async () => {
    const conn = baseAudience({
        learners: [
            { id: U(1), first_name: 'A', last_name: 'A', email: 'a@x.fr' },
            { id: U(2), first_name: 'B', last_name: 'B', email: 'b@x.fr' },
            { id: U(3), first_name: 'A', last_name: 'A', email: 'A@X.fr' }, // doublon d'adresse (casse)
        ],
        desinscrits: [U(2)],
    });
    const dest = await newsletter.audienceNewsletter(conn, ORG);
    const ids = dest.map((d) => d.id);
    assert.deepEqual(ids, [U(1)], 'B est désinscrit, le 3e est un doublon d\'adresse du 1er');
});

test('la requête du public exclut les sans-e-mail et les comptes désactivés (contrat SQL)', () => {
    const conn = baseAudience({ learners: [] });
    return newsletter.audienceNewsletter(conn, ORG).then(() => {
        const q = conn.requetes.find((r) => /FROM learner l LEFT JOIN user u/.test(r));
        assert.match(q, /l\.email IS NOT NULL AND TRIM\(l\.email\) <> ''/);
        assert.match(q, /u\.id IS NULL OR u\.active = 1/, 'un compte désactivé (active=0) est exclu ; sans compte, on garde');
    });
});

/* ── L'envoi ──────────────────────────────────────────────────────────────────────────────────── */

test('un e-mail par personne, chacun son propre lien ; un échec ne stoppe pas les autres', async () => {
    const conn = baseAudience({
        learners: [
            { id: U(1), first_name: 'A', last_name: 'A', email: 'a@x.fr' },
            { id: U(2), first_name: 'B', last_name: 'B', email: 'b@x.fr' },
        ],
    });
    const envois = [];
    const envoyer = async ({ to, objet, corps }) => {
        envois.push({ to, objet, corps });
        return { sent: to !== 'b@x.fr' }; // b échoue
    };
    const bilan = await newsletter.envoyerNewsletter(conn, { orgId: ORG, titre: 'Annonce', corps: 'Bonjour', envoyer });

    assert.equal(bilan.total, 2);
    assert.equal(bilan.envoyes, 1);
    assert.equal(bilan.echecs, 1, 'b a échoué mais a a bien reçu');
    assert.deepEqual(bilan.learnerIds, [U(1), U(2)]);

    // Deux jetons DIFFÉRENTS, chacun désinscrit LE BON stagiaire — jamais un lien partagé.
    const t1 = envois[0].corps.match(/desinscription\/([^\s)]+)/)[1];
    const t2 = envois[1].corps.match(/desinscription\/([^\s)]+)/)[1];
    assert.notEqual(t1, t2);
    assert.equal(newsletter.verifierLienDesinscription(t1).learnerId, U(1));
    assert.equal(newsletter.verifierLienDesinscription(t2).learnerId, U(2));
});

test('un envoyeur qui jette n\'arrête pas la tournée', async () => {
    const conn = baseAudience({
        learners: [
            { id: U(1), first_name: 'A', last_name: 'A', email: 'a@x.fr' },
            { id: U(2), first_name: 'B', last_name: 'B', email: 'b@x.fr' },
        ],
    });
    const envoyer = async ({ to }) => { if (to === 'a@x.fr') throw new Error('SMTP cassé'); return { sent: true }; };
    const bilan = await newsletter.envoyerNewsletter(conn, { orgId: ORG, titre: 'T', corps: 'C', envoyer });
    assert.equal(bilan.echecs, 1);
    assert.equal(bilan.envoyes, 1);
});

/* ── Le registre (opt-out) ────────────────────────────────────────────────────────────────────── */

function baseConsent({ rows = [], jette = null }) {
    const ecritures = [];
    return {
        ecritures,
        query: async (sql, params = []) => {
            const q = plat(sql);
            if (jette) { const e = new Error('absent'); e.code = jette; throw e; }
            if (/^INSERT INTO consent_record/.test(q)) { ecritures.push(params); return [{ affectedRows: 1 }]; }
            if (/FROM consent_record c JOIN/.test(q)) return [rows];
            return [[]];
        },
    };
}

test('se désinscrire écrit une ligne « newsletter » refusée, source du lien e-mail', async () => {
    const conn = baseConsent({});
    const r = await consentements.enregistrerNewsletter(conn, { orgId: ORG, learnerId: U(1), accorde: false });
    assert.equal(r.ok, true);
    const [p] = conn.ecritures;
    // INSERT (…, finalite='newsletter', accorde, destinataires, formulation, source, saisi_par)
    assert.ok(p.includes(ORG) && p.includes(U(1)));
    assert.ok(p.includes('lien_email'), 'source par défaut = le lien de l\'e-mail');
    assert.ok(p.includes(0), 'accorde = 0 (refus)');
});

test('une source inconnue retombe sur « lien_email » (jamais écrite telle quelle)', async () => {
    const conn = baseConsent({});
    await consentements.enregistrerNewsletter(conn, { orgId: ORG, learnerId: U(1), accorde: false, source: 'bidon' });
    assert.ok(conn.ecritures[0].includes('lien_email'));
    assert.ok(!conn.ecritures[0].includes('bidon'));
});

test('la dernière décision tranche : un refus récent = désinscrit', async () => {
    const conn = baseConsent({ rows: [{ learner_id: U(1), accorde: 0 }, { learner_id: U(2), accorde: 1 }] });
    const off = await consentements.desinscritsNewsletter(conn, ORG, [U(1), U(2)]);
    assert.ok(off.has(U(1)));
    assert.ok(!off.has(U(2)), 'U(2) a (re)consenti : il reçoit');
    assert.equal(await consentements.estInscritNewsletter(baseConsent({ rows: [{ learner_id: U(1), accorde: 0 }] }), ORG, U(1)), false);
});

test('sans la migration 130, personne n\'est désinscrit et l\'opt-out le DIT (rien ne casse)', async () => {
    const off = await consentements.desinscritsNewsletter(baseConsent({ jette: 'ER_NO_SUCH_TABLE' }), ORG, [U(1)]);
    assert.equal(off.size, 0);
    const r = await consentements.enregistrerNewsletter(baseConsent({ jette: 'ER_NO_SUCH_TABLE' }), { orgId: ORG, learnerId: U(1), accorde: false });
    assert.equal(r.ok, false);
    assert.match(r.message, /130/);
});

/* ── Contrats de source (le code dit ce qu'il fait) ───────────────────────────────────────────── */

test('la newsletter reste HORS de FINALITES — pas de case « Oui » à cocher', () => {
    assert.ok(!('newsletter' in consentements.FINALITES), 'une finalité dans FINALITES devient une question d\'opt-in');
    assert.ok(!consentements.FINALITES_CONNUES.includes('newsletter'));
    assert.equal(typeof consentements.enregistrerNewsletter, 'function');
    assert.equal(typeof consentements.desinscritsNewsletter, 'function');
});

test('une annonce ne part en e-mail que pour le bureau, et jamais une question', () => {
    const src = plat(lire('src/api/controllers/community.controller.js'));
    assert.match(src, /kind === 'ANNONCE' && estStaff\(req\.user\) && !!req\.body\?\.envoyer_newsletter/);
    // fire-and-forget : on NE l'attend PAS (pas de `await declencherNewsletter`).
    assert.ok(!/await declencherNewsletter/.test(src), 'l\'envoi ne doit jamais bloquer la publication');
    assert.match(src, /declencherNewsletter\(db, \{/);
});

test('la désinscription publique : GET valide sans écrire, POST désinscrit', () => {
    const src = plat(lire('src/api/controllers/public.controller.js'));
    // Le GET lit l'état (estInscritNewsletter) ; il n'appelle PAS enregistrerNewsletter.
    assert.match(src, /const getNewsletterUnsub = async[\s\S]*?estInscritNewsletter[\s\S]*?\};/);
    // Le POST, lui, écrit le refus.
    assert.match(src, /const postNewsletterUnsub = async[\s\S]*?enregistrerNewsletter\(conn, \{[\s\S]*?accorde: false/);
    const routes = lire('src/api/routes/public.routes.js');
    assert.match(routes, /router\.get\('\/newsletter\/:token', getNewsletterUnsub\)/);
    assert.match(routes, /router\.post\('\/newsletter\/:token', postNewsletterUnsub\)/);
});

test('les routes publiques sont montées SANS authentification', () => {
    const server = lire('src/api/server.js');
    assert.match(server, /app\.use\('\/api\/public', publicRoutes\)/);
});

test('la migration 202 et son revert existent, et sont tolérantes (IF [NOT] EXISTS)', () => {
    const aller = lire('database/migrations/202_community_newsletter.sql');
    const revert = lire('database/migrations/202_revert_community_newsletter.sql');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS newsletter_envoye_le/);
    assert.match(revert, /DROP COLUMN IF EXISTS newsletter_envoye_le/);
});
