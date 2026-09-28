/**
 * LA CLOCHE ET LE JOURNAL NOMMENT CE QU'ILS ANNONCENT — demandé le 2026-09-28 : « quand un stagiaire
 * signe un document, au lieu de ×2, mettre lequel : Document signé (devis) ; et pareil dans Activité
 * de l'équipe : savoir quel document a été généré, supprimé… ».
 *
 * LE DÉFAUT. Le journal ne porte qu'un code et un identifiant. La cloche en tirait « Document signé
 * ×2 », « Document supprimé » : QUOI, jamais LEQUEL, ni pour QUI. Il fallait ouvrir le dossier et
 * chercher.
 *
 * Ce fichier gèle :
 *   · la relecture (lib/precisionsActivite.js) : le nom de l'objet, le stagiaire et le lien, bornés à
 *     l'organisme, pour des identifiants en UUID seulement ;
 *   · le nom FIGÉ de ce qui est supprimé (migration 186), qui prime, et le nom du stagiaire qui ne l'est
 *     JAMAIS — un stagiaire effacé disparaît de la cloche ;
 *   · le regroupement : un seul axe par groupe, et le lien gardé s'il est commun ;
 *   · logAudit avec précisions, avant et après la migration ;
 *   · les appelants qui suppriment : ils nomment AVANT d'effacer ;
 *   · chaque colonne que les requêtes lisent existe dans le schéma — aucune n'a pu être jouée ici ;
 *   · l'écran : « Document signé (Devis, Convention) », et « ×2 » seulement quand les noms ne le disent pas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => s.replace(/\s+/g, ' ').trim();

/* ── Une fausse base, pour la relecture seulement ─────────────────────────────────────────────── */
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(900);
const AUTRE_ORG = U(901);

function fausseBase(d = {}) {
    const requetes = [];
    const conn = {
        query: async (sql, params = []) => {
            const q = plat(sql);
            requetes.push({ q, params });
            if (d.panne && d.panne.test(q)) throw Object.assign(new Error('panne simulée'), { code: 'ER_PANNE' });
            const [org, ids = []] = params;
            const voulus = ids.map((x) => String(x).toLowerCase());
            const garde = (liste) => (liste || []).filter((r) => r.organization_id === org && voulus.includes(String(r.id).toLowerCase()));
            if (/FROM generated_document d /.test(q)) return [garde(d.documents).map((r) => ({ id: r.id, objet: r.title, learner_id: r.learner_id }))];
            if (/FROM learner l /.test(q)) return [garde(d.stagiaires)];
            if (/FROM attendance_sheet s JOIN/.test(q)) return [garde(d.feuilles)];
            if (/^SELECT ts\.id, ts\.id AS session_id/.test(q)) return [garde(d.sessions)];
            if (/FROM remise_document rd /.test(q)) return [garde(d.remises)];
            if (/FROM remise_type rt WHERE/.test(q)) return [garde(d.typesRemise)];
            if (/FROM enrollment e WHERE/.test(q)) return [garde(d.dossiers)];
            if (/FROM company c /.test(q)) return [garde(d.entreprises)];
            return [[]];
        },
    };
    return { conn, requetes };
}

const { preciser, libelleSession, nommer, RESOLVEURS } = require('../lib/precisionsActivite.js');
const { regrouperConsecutives } = require('../lib/activite.js');

const JEAN = { id: U(1), organization_id: ORG, first_name: 'Jean', last_name: 'DUPONT', user_id: U(11) };
const MARIE = { id: U(2), organization_id: ORG, first_name: 'Marie', last_name: 'MARTIN', user_id: U(12) };
const DEVIS = { id: U(20), organization_id: ORG, title: 'Devis particulier', learner_id: JEAN.id };

/* ── La relecture ─────────────────────────────────────────────────────────────────────────────── */

test('un document signé se NOMME, avec son stagiaire — et la ligne mène à SA fiche', async () => {
    const { conn } = fausseBase({ documents: [DEVIS], stagiaires: [JEAN] });
    const [p] = await preciser(conn, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id, user_id: JEAN.user_id }]);
    assert.strictEqual(p.objet, 'Devis particulier');
    assert.deepStrictEqual(p.stagiaire, { id: JEAN.id, nom: 'Jean DUPONT', soi: true },
        '`soi` : c\'est lui qui a signé — « par Jean DUPONT » le nomme déjà');
    assert.strictEqual(p.lien, `/stagiaires/${JEAN.id}`,
        'la ligne n\'avait AUCUN lien : un document n\'a pas de page, sa fiche en a une');
    // Signé par quelqu'un d'autre (un représentant) : le stagiaire est redit.
    const [q] = await preciser(conn, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id, user_id: U(99) }]);
    assert.strictEqual(q.stagiaire.soi, false);
});

test('BORNÉ À L\'ORGANISME : un identifiant d\'un autre organisme ne se nomme pas', async () => {
    const etranger = { ...DEVIS, organization_id: AUTRE_ORG };
    const { conn, requetes } = fausseBase({ documents: [etranger], stagiaires: [{ ...JEAN, organization_id: AUTRE_ORG }] });
    const [p] = await preciser(conn, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id }]);
    assert.deepStrictEqual(p, { objet: null, stagiaire: null, lien: null });
    assert.ok(requetes.every((r) => r.params[0] === ORG), 'chaque requête reçoit l\'organisme en premier');
    // Et chaque requête le POSE : une requête sans lui nommerait les objets d'un autre organisme.
    for (const [entite, sqls] of Object.entries(RESOLVEURS)) {
        for (const sql of sqls) {
            assert.match(plat(sql), /WHERE \w+\.organization_id = \? AND \w+\.id IN \(\?\)$/, `${entite} : borné à l'organisme`);
        }
    }
    assert.match(plat(lire('src/api/lib/precisionsActivite.js')), /FROM learner l WHERE l\.organization_id = \? AND l\.id IN \(\?\)/);
});

test('seuls des UUID partent en requête : un slug de modèle n\'y passe jamais', async () => {
    const { conn, requetes } = fausseBase();
    await preciser(conn, ORG, [
        { entity: 'DocumentTemplate', entity_id: 'grille-jury' },
        { entity: 'GeneratedDocument', entity_id: 'pas-un-uuid' },
        { entity: 'AccessProfile', entity_id: 'FORMATEUR' },
    ]);
    assert.strictEqual(requetes.length, 0, 'la colonne est en uuid : un slug y lèverait une erreur');
});

test('LE NOM FIGÉ prime (ce qui est supprimé), le stagiaire se relit TOUJOURS dans sa fiche', async () => {
    const { conn } = fausseBase({ stagiaires: [JEAN] });
    // Un document supprimé : plus rien à relire, la migration 186 a gardé son titre et son stagiaire.
    const [p] = await preciser(conn, ORG, [{
        entity: 'GeneratedDocument', entity_id: U(30), libelle: 'Attestation de fin de formation', learner_id: JEAN.id,
    }]);
    assert.strictEqual(p.objet, 'Attestation de fin de formation');
    assert.strictEqual(p.stagiaire.nom, 'Jean DUPONT');
    // Le figé l'emporte sur le relu : c'est le nom qu'avait l'objet quand la chose s'est passée.
    const { conn: c2 } = fausseBase({ documents: [DEVIS], stagiaires: [JEAN] });
    const [q] = await preciser(c2, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id, libelle: 'Devis (ancien titre)' }]);
    assert.strictEqual(q.objet, 'Devis (ancien titre)');
});

test('UN STAGIAIRE EFFACÉ disparaît de la cloche : ni nom, ni lien vers une fiche vide', async () => {
    const { conn } = fausseBase({ stagiaires: [] });
    const [p] = await preciser(conn, ORG, [{ entity: 'Learner', entity_id: JEAN.id }]);
    assert.strictEqual(p.stagiaire, null, 'son nom n\'est copié nulle part : il part avec sa fiche');
    assert.strictEqual(p.lien, null, 'lienDeLEntite menait à /stagiaires/<id> même effacé');
    const { conn: c2 } = fausseBase({ stagiaires: [JEAN] });
    const [q] = await preciser(c2, ORG, [{ entity: 'Learner', entity_id: JEAN.id.toUpperCase() }]);
    assert.strictEqual(q.stagiaire.nom, 'Jean DUPONT', 'un UUID en capitales se retrouve quand même');
});

test('un identifiant qui change de sens : la seconde requête le lit tel qu\'il est écrit', async () => {
    // « Émargement généré » journalise la SESSION sous AttendanceSheet.
    const session = { id: U(40), organization_id: ORG, session_id: U(40), code: 'RS7404', semaine: 38, annee: 2026 };
    const feuille = { id: U(41), organization_id: ORG, session_id: U(40), code: 'RS7404', jour: '14/09', creneau: 'APRES_MIDI' };
    const { conn } = fausseBase({ sessions: [session], feuilles: [feuille] });
    const [gen, sig] = await preciser(conn, ORG, [
        { entity: 'AttendanceSheet', entity_id: session.id },
        { entity: 'AttendanceSheet', entity_id: feuille.id },
    ]);
    assert.strictEqual(gen.objet, 'RS7404 · S38 2026');
    assert.strictEqual(sig.objet, 'RS7404 · 14/09 après-midi');
    assert.strictEqual(gen.lien, `/sessions/${session.id}`, 'un émargement mène à SA session');
    // « Remise écartée » journalise le TYPE de remise sous RemiseDocument.
    const { conn: c2 } = fausseBase({ typesRemise: [{ id: U(50), organization_id: ORG, objet: 'Carte professionnelle' }] });
    const [r] = await preciser(c2, ORG, [{ entity: 'RemiseDocument', entity_id: U(50) }]);
    assert.strictEqual(r.objet, 'Carte professionnelle');
});

test('LE LIEN RESTE DANS LA RUBRIQUE : un avis du jury mène à la session, pas à la fiche', async () => {
    /* Un formateur qui ne voit que les sessions reçoit cette ligne ; un lien vers une fiche de
       stagiaire lui ouvrirait une page fermée. */
    const { conn } = fausseBase({ dossiers: [{ id: U(60), organization_id: ORG, learner_id: JEAN.id, session_id: U(40) }], stagiaires: [JEAN] });
    const [p] = await preciser(conn, ORG, [{ entity: 'EvaluationVerdict', entity_id: U(60) }]);
    assert.strictEqual(p.stagiaire.nom, 'Jean DUPONT');
    assert.strictEqual(p.lien, `/sessions/${U(40)}`);
    // Une entreprise supprimée n'a plus de lien : il menait à une page vide.
    const { conn: c2 } = fausseBase({ entreprises: [] });
    const [e] = await preciser(c2, ORG, [{ entity: 'Company', entity_id: U(70), libelle: 'PIZZERIA ROMA' }]);
    assert.strictEqual(e.objet, 'PIZZERIA ROMA');
    assert.strictEqual(e.lien, null);
});

test('une requête en panne : ses lignes restent sans nom, la cloche s\'affiche quand même', async () => {
    const { conn } = fausseBase({ documents: [DEVIS], stagiaires: [JEAN], panne: /FROM generated_document/ });
    const erreurs = console.error; const dits = []; console.error = (m) => dits.push(String(m));
    try {
        const [p] = await preciser(conn, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id }]);
        assert.deepStrictEqual(p, { objet: null, stagiaire: null, lien: null });
        await preciser(conn, ORG, [{ entity: 'GeneratedDocument', entity_id: DEVIS.id }]);
    } finally { console.error = erreurs; }
    assert.strictEqual(dits.length, 1, 'dit une fois, pas à chaque passage de la cloche');
});

test('le nom d\'une session quittée, pour le retrait d\'un stagiaire', async () => {
    const { conn } = fausseBase({ sessions: [{ id: U(40), organization_id: ORG, code: 'NIV1', semaine: 5, annee: 2027 }] });
    assert.strictEqual(await libelleSession(conn, ORG, U(40)), 'NIV1 · S5 2027');
    assert.strictEqual(await libelleSession(conn, ORG, 'pas-un-uuid'), null);
    assert.strictEqual(nommer(null), null);
});

/* ── Le regroupement ──────────────────────────────────────────────────────────────────────────── */

const ligne = (objet, stagiaire, link = null) => ({ action: 'document.sign', entity: 'GeneratedDocument', auteur: 'Jean DUPONT', is_read: 1, objet, stagiaire, link });
const sJ = { id: JEAN.id, nom: 'Jean DUPONT', soi: false };
const sM = { id: MARIE.id, nom: 'Marie MARTIN', soi: false };

test('deux documents d\'UN stagiaire : une ligne qui les nomme, et le lien vers sa fiche reste', () => {
    const r = regrouperConsecutives([ligne('Devis', sJ, '/stagiaires/j'), ligne('Convention', sJ, '/stagiaires/j')]);
    assert.strictEqual(r.length, 1);
    assert.deepStrictEqual(r[0].objets, ['Devis', 'Convention']);
    assert.deepStrictEqual(r[0].stagiaires, [sJ]);
    assert.strictEqual(r[0].link, '/stagiaires/j', 'le lien est celui de CHACUNE des lignes');
});

test('UN document pour plusieurs stagiaires : une ligne, les noms dans le corps, plus de lien', () => {
    const r = regrouperConsecutives([ligne('Convention', sJ, '/stagiaires/j'), ligne('Convention', sM, '/stagiaires/m')]);
    assert.strictEqual(r.length, 1);
    assert.deepStrictEqual(r[0].objets, ['Convention']);
    assert.deepStrictEqual(r[0].stagiaires.map((s) => s.nom), ['Jean DUPONT', 'Marie MARTIN']);
    assert.strictEqual(r[0].link, null, 'deux fiches : garder la première en ouvrirait une au hasard');
});

test('JAMAIS DEUX AXES : un autre document POUR un autre stagiaire reste une ligne à part', () => {
    /* « Convention, Devis » et « Jean, Marie » côte à côte ne disent plus lequel va avec qui. */
    const r = regrouperConsecutives([ligne('Convention', sJ), ligne('Devis', sM)]);
    assert.strictEqual(r.length, 2);
    const r3 = regrouperConsecutives([ligne('Convention', sJ), ligne('Convention', sM), ligne('Devis', sM)]);
    assert.deepStrictEqual(r3.map((g) => g.nombre), [2, 1], 'le troisième aurait mêlé les deux axes');
});

test('les lignes sans nom (d\'avant, ou d\'un objet disparu) se regroupent comme avant', () => {
    const r = regrouperConsecutives([ligne(null, null), ligne(null, null), ligne(null, null)]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].nombre, 3);
    assert.deepStrictEqual([r[0].objets, r[0].stagiaires], [[], []]);
});

/* ── logAudit, avec précisions ────────────────────────────────────────────────────────────────── */

const faux = { essais: [], refus: null };
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    query: (sql, params, cb) => {
        faux.essais.push({ q: plat(sql), params });
        const err = faux.refus && faux.refus(plat(sql));
        cb(err || null, err ? undefined : { affectedRows: 1 });
    },
} };
function auditNeuf() {
    delete require.cache[require.resolve('../lib/audit.js')];
    return require('../lib/audit.js');
}
const requete = { user: { organization_id: ORG, id: U(11) } };

test('avec précisions : le nom et le stagiaire partent dans la forme longue', async () => {
    const { logAudit } = auditNeuf();
    faux.essais = []; faux.refus = null;
    await logAudit(requete, 'document.delete', 'GeneratedDocument', U(30), { libelle: '  Devis   particulier ', stagiaire: JEAN.id });
    assert.strictEqual(faux.essais.length, 1);
    assert.match(faux.essais[0].q, /^INSERT INTO audit_log \(id, organization_id, user_id, action, entity, entity_id, libelle, learner_id\)/);
    assert.deepStrictEqual(faux.essais[0].params.slice(3), ['document.delete', 'GeneratedDocument', U(30), 'Devis particulier', JEAN.id]);
    // Sans précisions : la forme COURTE, identique à celle d'avant la migration.
    faux.essais = [];
    await logAudit(requete, 'document.sign', 'GeneratedDocument', U(30));
    assert.match(faux.essais[0].q, /^INSERT INTO audit_log \(id, organization_id, user_id, action, entity, entity_id\) VALUES/);
});

test('AVANT LA 186 : la trace est gardée sans ses précisions, et la console le dit une fois', async () => {
    const { logAudit } = auditNeuf();
    faux.essais = [];
    faux.refus = (q) => (/libelle, learner_id/.test(q)
        ? Object.assign(new Error("Unknown column 'libelle' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' }) : null);
    const erreurs = console.error; const dits = []; console.error = (m) => dits.push(String(m));
    try {
        await logAudit(requete, 'document.delete', 'GeneratedDocument', U(30), { libelle: 'Devis' });
        await logAudit(requete, 'document.delete', 'GeneratedDocument', U(31), { libelle: 'Convention' });
    } finally { console.error = erreurs; faux.refus = null; }
    const courtes = faux.essais.filter((e) => !/libelle/.test(e.q));
    assert.strictEqual(courtes.length, 2, 'les deux lignes sont écrites, sans leur nom');
    assert.deepStrictEqual(courtes.map((e) => e.params[5]), [U(30), U(31)]);
    assert.strictEqual(courtes[0].params[0], faux.essais[0].params[0], 'même identifiant pour les deux essais');
    assert.strictEqual(dits.length, 1);
    assert.match(dits[0], /migration 186/);
});

test('les précisions sont TRIÉES : un stagiaire qui n\'est pas un UUID, un champ inconnu, un objet quelconque', () => {
    const { lirePrecisions } = auditNeuf();
    assert.strictEqual(lirePrecisions(null), null);
    assert.strictEqual(lirePrecisions('Devis'), null, 'une chaîne n\'est pas des précisions');
    assert.strictEqual(lirePrecisions({ title: 'Chapitre 1', rang: 2 }), null, 'l\'ancien « détails » de Pizza Quest ne se lisait pas');
    assert.deepStrictEqual(lirePrecisions({ stagiaire: 'FORMATEUR', libelle: 'x' }), { libelle: 'x', stagiaire: null });
    assert.strictEqual(lirePrecisions({ libelle: 'é'.repeat(400) }).libelle.length, 255, 'la colonne en tient 255');
});

/* ── Les appelants qui suppriment ─────────────────────────────────────────────────────────────── */

const CTRL = (f) => lire(`src/api/controllers/${f}`);
const bloc = (src, debut) => src.slice(src.indexOf(debut), src.indexOf('\n};\n', src.indexOf(debut)));

test('supprimer un document : son titre et son stagiaire, lus AVANT, partent au journal', () => {
    const b = bloc(CTRL('document.controller.js'), 'const deleteDocument');
    assert.match(b, /SELECT id, type, enrollment_id, quiz_id, title, learner_id FROM generated_document/);
    assert.match(b, /const precisions = \{ libelle: doc\.title, stagiaire: doc\.learner_id \};/);
    assert.match(b, /logAudit\(req, 'quiz\.response_delete', 'QuizResponse', id, precisions\)/);
    assert.match(b, /logAudit\(req, 'document\.delete', 'GeneratedDocument', req\.params\.id, precisions\)/);
});

test('retirer un stagiaire en effaçant : chaque document nommé, et la session quittée', () => {
    const b = bloc(CTRL('enrollment.controller.js'), 'const deleteEnrollment');
    assert.match(b, /libelle: effaces\.libelles\[id\], stagiaire: e\.learner_id/);
    assert.match(b, /logAudit\(req, 'enrollment\.delete', 'Learner', e\.learner_id, \{ libelle: await libelleSession\(conn, orgId, e\.session_id\) \}\)/);
    assert.match(lire('src/api/lib/retraitDossier.js'), /if \(d\.title\) for \(const id of \[d\.id, \.\.\.reponses\]\) effaces\.libelles\[id\] = d\.title;/);
});

test('une réponse QCM, une entreprise : lues AVANT d\'être effacées', () => {
    const q = bloc(CTRL('quiz.controller.js'), 'const deleteResponse');
    assert.ok(q.indexOf('SELECT q.title') > -1 && q.indexOf('SELECT q.title') < q.indexOf('DELETE FROM quiz_response'));
    assert.match(q, /\{ libelle: lue\.title, stagiaire: lue\.learner_id \}/);
    const c = bloc(CTRL('company.controller.js'), 'const deleteCompany');
    assert.ok(c.indexOf('SELECT name FROM company') > -1 && c.indexOf('SELECT name FROM company') < c.indexOf('DELETE FROM company'));
    assert.match(c, /logAudit\(req, 'company\.delete', 'Company', req\.params\.id, avant \? \{ libelle: avant\.name \} : null\)/);
    // Une note se journalise sous l'EXERCICE : le stagiaire noté est passé à part.
    assert.strictEqual((CTRL('evaluation.controller.js').match(/logAudit\(req, 'evaluation\.note', 'EvaluationNote', exerciceId, \{ stagiaire: ex\.stagiaire \}\)/g) || []).length, 2);
});

test('LE NOM D\'UNE PERSONNE N\'EST JAMAIS FIGÉ : un stagiaire effacé ne survit pas dans le journal', () => {
    // La suppression d'une fiche ne passe aucun libellé : son nom serait la seule chose à survivre.
    assert.match(CTRL('learner.controller.js'), /logAudit\(req, 'learner\.delete', 'Learner', req\.params\.id\);/);
    // Les colonnes figées sont un titre et un identifiant — pas de nom de stagiaire.
    const mig = lire('database/migrations/186_audit_precisions.sql');
    assert.match(mig, /Jamais le nom d'une personne/);
    assert.doesNotMatch(mig.replace(/\/\*[\s\S]*?\*\//g, ''), /first_name|last_name|nom/);
});

/* ── La migration, le schéma, et chaque colonne lue ───────────────────────────────────────────── */

test('la 186 : deux colonnes, rejouable, commentée en blocs — et son revert', () => {
    const mig = lire('database/migrations/186_audit_precisions.sql');
    const rev = lire('database/migrations/186_revert_audit_precisions.sql');
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(mig, /^\s*--/m, 'commentaires en blocs /* */');
    assert.match(code(mig), /ALTER TABLE audit_log\s+ADD COLUMN IF NOT EXISTS libelle varchar\(255\) DEFAULT NULL,\s+ADD COLUMN IF NOT EXISTS learner_id uuid DEFAULT NULL;/);
    assert.doesNotMatch(code(mig), /REFERENCES|FOREIGN KEY/, 'pas de clé étrangère : le journal garde sa ligne quand la fiche part');
    assert.match(code(rev), /DROP COLUMN IF EXISTS learner_id,\s+DROP COLUMN IF EXISTS libelle;/);
    const schema = lire('database/schema.sql');
    assert.match(schema, /\n\s+libelle\s+varchar\(255\)\s+DEFAULT NULL,/);
    assert.match(schema, /\n\s+learner_id\s+uuid\s+DEFAULT NULL,\s+-- stagiaire concerné/);
});

/** Les colonnes d'une table, d'après schema.sql et TOUTES les migrations (création + ajouts). */
function colonnesConnues() {
    const sources = [lire('database/schema.sql'),
        ...fs.readdirSync(path.join(RACINE, 'database/migrations')).filter((f) => f.endsWith('.sql') && !/revert/.test(f))
            .map((f) => lire(`database/migrations/${f}`))];
    const cols = new Map();
    const noter = (t, c) => { if (!cols.has(t)) cols.set(t, new Set()); cols.get(t).add(c.toLowerCase()); };
    for (const src of sources.map((s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, ''))) {
        for (const m of src.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`?(\w+)`?\s*\(([\s\S]*?)\n\)/g)) {
            for (const l of m[2].split('\n')) {
                const c = /^\s*`?(\w+)`?\s+\w+/.exec(l);
                if (c && !/^(PRIMARY|KEY|UNIQUE|CONSTRAINT|INDEX|FOREIGN|FULLTEXT)$/i.test(c[1])) noter(m[1], c[1]);
            }
        }
        for (const m of src.matchAll(/ALTER TABLE `?(\w+)`?([\s\S]*?);/g)) {
            for (const a of m[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?`?(\w+)`?/g)) noter(m[1], a[1]);
        }
    }
    return cols;
}

/** Chaque `alias.colonne` d'une requête existe dans la table que l'alias désigne. */
function colonnesInconnues(sql, cols) {
    const q = plat(sql).replace(/'[^']*'/g, "''");
    const alias = new Map();
    for (const m of q.matchAll(/\b(?:FROM|JOIN) (\w+) (\w+)\b/g)) alias.set(m[2], m[1]);
    const manquantes = [];
    for (const m of q.matchAll(/\b(\w+)\.(\w+)\b/g)) {
        const table = alias.get(m[1]);
        if (!table) { manquantes.push(`${m[1]}.${m[2]} (alias inconnu)`); continue; }
        if (!cols.get(table) || !cols.get(table).has(m[2].toLowerCase())) manquantes.push(`${table}.${m[2]}`);
    }
    return manquantes;
}

test('CHAQUE COLONNE LUE EXISTE : aucune de ces requêtes n\'a pu être jouée sur la vraie base', () => {
    /* Le projet n'exécute aucun SQL hors des migrations que l'utilisateur joue lui-même : une faute
       de colonne ne se verrait qu'en production, et en silence — la requête échoue, la ligne reste
       sans nom. Ce contrôle confronte chaque `alias.colonne` au schéma et aux migrations. */
    const cols = colonnesConnues();
    const requetes = [...Object.values(RESOLVEURS).flat(),
        /SELECT l\.id, l\.first_name[\s\S]*?IN \(\?\)/.exec(lire('src/api/lib/precisionsActivite.js'))[0],
        /SELECT q\.title, COALESCE[\s\S]*?organization_id = \?/.exec(CTRL('quiz.controller.js'))[0]];
    assert.ok(requetes.length >= 18, `requêtes contrôlées : ${requetes.length}`);
    const fautes = requetes.flatMap((sql) => colonnesInconnues(sql, cols));
    assert.deepStrictEqual(fautes, []);
    // Le contrôle lui-même attrape une faute : sans quoi il passerait au vert quoi qu'on écrive.
    assert.deepStrictEqual(colonnesInconnues('SELECT d.titre FROM generated_document d WHERE d.id = ?', cols), ['generated_document.titre']);
});

/* ── L'écran ──────────────────────────────────────────────────────────────────────────────────── */

const LABELS = path.join(RACINE, 'src/app/ui/lib/auditLabels.js');
const charger = () => import(`file://${LABELS}`);
const PAGE = lire('src/app/ui/pages/Notifications.jsx');

test('« Document signé (Devis particulier) » : le libellé et ce qu\'il désigne', async () => {
    const { avecObjets, listeCourte, auditLabel } = await charger();
    assert.strictEqual(avecObjets('Document signé', ['Devis particulier']), 'Document signé (Devis particulier)');
    assert.strictEqual(avecObjets('Document signé', ['Devis', 'Convention']), 'Document signé (Devis, Convention)');
    assert.strictEqual(avecObjets('Stagiaire ajouté', []), 'Stagiaire ajouté');
    // Deux parenthèses de suite se lisaient mal : « en PDF », et un deux-points pour le reste.
    assert.strictEqual(auditLabel('document.pdf', 'GeneratedDocument').label, 'Document généré en PDF');
    assert.strictEqual(avecObjets('Publication supprimée (modération)', ['Ma pâte']), 'Publication supprimée (modération)\u00a0: Ma pâte');
    assert.doesNotMatch(avecObjets('X (y)', ['z']), /[—–]/, 'pas de tiret long dans l\'interface (commit 5bc392e4)');
    // Quatre noms en entier ; au-delà, trois et le compte — jamais « et 1 autre ».
    assert.strictEqual(listeCourte(['A', 'B', 'C', 'D']), 'A, B, C, D');
    assert.strictEqual(listeCourte(['A', 'B', 'C', 'D', 'E']), 'A, B, C et 2 autres');
});

test('l\'écran nomme, dit pour qui, et ne compte que ce que les noms ne disent pas', () => {
    assert.match(PAGE, /const titre = `\$\{avecObjets\(label, objets\)\}\$\{fois\}`;/);
    assert.match(PAGE, /const fois = n\.nombre > Math\.max\(objets\.length, stagiaires\.length, 1\) \? ` ×\$\{n\.nombre\}` : "";/,
        '« ×2 » à côté de deux noms redisait ce que la liste montre');
    assert.match(PAGE, /stagiaires\.filter\(\(s\) => !s\.soi\)/, 'le stagiaire qui a agi n\'est pas nommé deux fois');
    const journal = lire('src/app/ui/pages/Audit.jsx');
    assert.match(journal, /\{quoi \|\| entityLabel\(r\.entity\)\}/, 'le journal nomme l\'objet, l\'entité en repli');
    assert.match(lire('src/app/ui/pages/Dashboard.jsx'), /avecObjets\(label, a\.objet \? \[a\.objet\] : \[\]\)/);
    assert.match(lire('src/api/controllers/notification.controller.js'), /objet: p\.objet,\s+stagiaire: p\.stagiaire,/);
});
