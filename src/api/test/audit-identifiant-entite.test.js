/**
 * LE JOURNAL D'AUDIT NE PERD PLUS CE QUI NE SE DÉSIGNE PAS PAR UN UUID (relevé le 2026-09-22,
 * migration 175).
 *
 * LE DÉFAUT. `audit_log.entity_id` était de type `uuid`, et `logAudit(req, 'template.save',
 * 'DocumentTemplate', slug)` y écrivait un SLUG. MariaDB, en mode strict, refusait la ligne
 * entière, et `logAudit`, non bloquant, n'en laissait qu'un `console.error` — à chaque appel, si
 * bien que plus personne ne le lisait. Constaté en production par `GET /api/audit?q=template` :
 * aucune ligne `template.save`, alors que les modèles s'enregistrent chaque semaine. Le même jour,
 * une vérification (« le modèle a-t-il été enregistré ? ») s'est fiée à ce journal vide.
 *
 * Même sort pour le nom d'un rôle système (`accessprofile.system`, « FORMATEUR »). Les 132 autres
 * appels écrivent un UUID, ou rien.
 *
 * Ce fichier gèle :
 *   · la colonne — dans le schéma et dans la migration — contient tout ce que le code y écrit :
 *     un UUID, le plus long slug que `document_template` accepte, chaque nom de rôle système ;
 *   · enregistrer un modèle, poser les modèles du jury, réinitialiser un modèle, personnaliser un
 *     rôle : la trace s'écrit AVEC son identifiant, sur une fausse base qui refuse ce que la
 *     colonne déclarée dans schema.sql refuserait, comme MariaDB en mode strict ;
 *   · avant la migration, la trace est gardée SANS son identifiant plutôt que perdue, et la
 *     console le dit UNE fois, pas à chaque appel ;
 *   · le revert efface ce qu'un uuid ne peut pas contenir AVANT de rétrécir la colonne ;
 *   · aucun appel ne passe un OBJET à logAudit : les trois des catégories de partenaires le
 *     faisaient, et le journal y lisait « [object Object] », sans entité ni identifiant.
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const SCHEMA = lire('database/schema.sql');
const MIG = lire('database/migrations/175_audit_identifiant_texte.sql');
const REV = lire('database/migrations/175_revert_audit_identifiant_texte.sql');
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Type d'une colonne dans le CREATE TABLE de schema.sql : « uuid », « varchar(64) »… */
function typeColonne(table, colonne) {
    const bloc = SCHEMA.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\)`));
    assert.ok(bloc, `table ${table} introuvable dans schema.sql`);
    const ligne = bloc[1].match(new RegExp(`^\\s*${colonne}\\s+(\\w+(?:\\(\\d+\\))?)`, 'm'));
    assert.ok(ligne, `colonne ${table}.${colonne} introuvable dans schema.sql`);
    return ligne[1].toLowerCase();
}

/**
 * Ce que MariaDB en mode strict répond quand on écrit cette valeur dans une colonne de ce type :
 * `null` si elle y tient, sinon l'erreur qu'il lève — même code, même message.
 */
function refus(type, colonne, valeur) {
    if (valeur == null) return null;
    if (type === 'uuid') {
        if (UUID.test(String(valeur))) return null;
        return Object.assign(new Error(`Incorrect uuid value: '${valeur}' for column `
            + `\`impastio\`.\`audit_log\`.\`${colonne}\` at row 1`),
        { code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', errno: 1366 });
    }
    const largeur = type.match(/^(?:var)?char\((\d+)\)$/);
    assert.ok(largeur, `type non simulé : ${type}`);
    if (String(valeur).length <= Number(largeur[1])) return null;
    return Object.assign(new Error(`Data too long for column '${colonne}' at row 1`),
        { code: 'ER_DATA_TOO_LONG', errno: 1406 });
}

// ── Fausse base ─────────────────────────────────────────────────────────────────────────────
/* Elle ne connaît que ce que les contrôleurs testés lui demandent. Pour `audit_log`, elle fait
   ce que ferait MariaDB : elle refuse l'identifiant que la colonne ne peut pas contenir — par
   défaut la colonne telle que schema.sql la déclare, c'est tout l'objet du test. */
let base;
function nouvelleBase(o = {}) {
    return {
        typeEntityId: typeColonne('audit_log', 'entity_id'),
        modeles: [],     // lignes document_template déjà en base
        categories: [],  // lignes partner_category déjà en base
        tentatives: [],  // paramètres de CHAQUE INSERT INTO audit_log, réussi ou non
        journal: [],     // les lignes réellement écrites
        panne: null,     // une erreur que l'INSERT renvoie quoi qu'on lui donne
        lance: false,    // db.query lève au lieu de rappeler
        ...o,
    };
}
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^SELECT id FROM document_template WHERE organization_id = \? AND slug = \?/.test(q)) {
                return [base.modeles.filter((m) => m.organization_id === params[0] && m.slug === params[1])];
            }
            if (/^SELECT slug FROM document_template WHERE organization_id = \? AND slug IN \(\?\)/.test(q)) {
                return [base.modeles.filter((m) => m.organization_id === params[0] && params[1].includes(m.slug))];
            }
            if (/^SELECT COALESCE\(MAX\(sort_order\), 0\) AS n FROM partner_category/.test(q)) return [[{ n: 0 }]];
            if (/^SELECT id, code, label FROM partner_category WHERE id = \? AND organization_id = \?/.test(q)) {
                return [base.categories.filter((c) => c.id === params[0] && c.organization_id === params[1])];
            }
            if (/^SELECT COUNT\(\*\) AS n FROM partner WHERE organization_id = \? AND category = \?/.test(q)) return [[{ n: 0 }]];
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) return [{ affectedRows: 1 }];
            return [[]];
        },
    }),
    query: (sql, params, cb) => {
        if (base.lance) throw new Error('pool indisponible');
        if (!/^INSERT INTO audit_log \(id, organization_id, user_id, action, entity, entity_id\)/.test(sql.replace(/\s+/g, ' ').trim())) {
            return cb(null, []);
        }
        base.tentatives.push(params);
        const err = base.panne || refus(base.typeEntityId, 'entity_id', params[5]);
        if (err) return cb(err);
        const [id, organization_id, user_id, action, entity, entity_id] = params;
        base.journal.push({ id, organization_id, user_id, action, entity, entity_id });
        return cb(null, { affectedRows: 1 });
    },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const tpl = require('../controllers/template.controller.js');
const roles = require('../controllers/accessProfile.controller.js');
const partenaires = require('../controllers/partner.controller.js');
const { lienDeLEntite } = require('../lib/activite.js');
const { MODELES: MODELES_JURY } = require('../lib/modelesJury.js');

const requete = (o = {}) => ({
    params: {}, query: {}, body: {},
    user: { id: 'u1', organization_id: 'o1', role: 'ADMIN_ORGANISME' },
    ...o,
});
function reponse() {
    return {
        code: 200, corps: undefined,
        status(c) { this.code = c; return this; },
        json(b) { this.corps = b; return this; },
    };
}
/** Ce que le journal a retenu : action, entité, identifiant. */
const traces = () => base.journal.map((l) => [l.action, l.entity, l.entity_id]);

/** Les sources de l'API (hors tests et dépendances), chemin relatif → contenu. */
function sourcesApi() {
    const API = path.join(__dirname, '..');
    const out = new Map();
    const parcourir = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', 'test', 'uploads'].includes(f.name)) continue;
            const p = path.join(dir, f.name);
            if (f.isDirectory()) parcourir(p);
            else if (f.name.endsWith('.js')) out.set(path.relative(API, p), fs.readFileSync(p, 'utf8'));
        }
    };
    parcourir(API);
    return out;
}
/* Sans commentaires : ils CITENT la forme fautive pour dire de ne pas l'écrire. Aucune chaîne de
   l'API ne contient « /* » (vérifié le 2026-09-22), et un « // » ne compte que précédé d'un blanc
   — « https:// » reste donc intact. Les sauts de ligne restent : le numéro de ligne d'un fautif
   doit être le vrai. */
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');

/** Un `lib/audit.js` NEUF : ce qu'il a déjà signalé vit dans le module, pour tout le processus. */
function auditNeuf() {
    delete require.cache[require.resolve('../lib/audit.js')];
    return require('../lib/audit.js').logAudit;
}
/** Exécute `fn` en recueillant ce qui part sur console.error. */
async function console_(fn) {
    const sortie = [];
    const avant = console.error;
    console.error = (...a) => sortie.push(a.join(' '));
    try { await fn(); } finally { console.error = avant; }
    return sortie;
}

// ── La colonne ──────────────────────────────────────────────────────────────────────────────

test('la colonne contient tout ce que le code y écrit : UUID, slug de modèle, nom de rôle', () => {
    /* Les largeurs sont LUES, pas recopiées : si document_template.slug s'élargit demain, ou si un
       rôle système au nom plus long apparaît, c'est ici que ça se voit. */
    const largeurSlug = Number(typeColonne('document_template', 'slug').match(/\((\d+)\)/)[1]);
    const nomsDeRoles = [...lire('src/api/controllers/accessProfile.controller.js')
        .match(/const SYSTEM_ROLES = new Set\(\[([^\]]+)\]\)/)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    assert.ok(largeurSlug >= 60 && nomsDeRoles.includes('FORMATEUR'), 'lecture des largeurs');

    const ecrits = [crypto.randomUUID(), 'grille-jury', 'droit-image', 'x'.repeat(largeurSlug), ...nomsDeRoles];
    const typeMigration = code(MIG).match(/ALTER TABLE audit_log\s+MODIFY COLUMN entity_id (\w+\(\d+\)) DEFAULT NULL;/)[1];
    assert.strictEqual(typeMigration, 'varchar(64)');
    assert.strictEqual(typeColonne('audit_log', 'entity_id'), typeMigration, 'schema.sql dit ce que fait la 175');
    for (const valeur of ecrits) {
        assert.strictEqual(refus(typeMigration, 'entity_id', valeur), null, `« ${valeur} » doit tenir dans ${typeMigration}`);
    }
    // Et c'est bien ce que la colonne d'avant refusait : le défaut n'est pas un cas d'école.
    assert.ok(refus('uuid', 'entity_id', 'grille-jury'), 'uuid refuse un slug');
    assert.ok(refus('uuid', 'entity_id', 'FORMATEUR'), 'uuid refuse un nom de rôle');
});

test('qui lit entity_id, et pourquoi un slug n\'y casse rien', () => {
    /* L'INVENTAIRE DES LECTEURS, fait avant de changer le type : aucune jointure, aucun index,
       aucun écran qui l'affiche. Le journal (`GET /api/audit`) et la cloche la renvoient telle
       quelle. Un fichier de plus qui la nomme est un lecteur de plus : qu'il sache qu'elle ne
       contient pas que des UUID. */
    const lecteurs = [...sourcesApi()].filter(([, src]) => /\bentity_id\b/.test(src)).map(([rel]) => rel);
    assert.deepStrictEqual(lecteurs.sort(), [
        'controllers/audit.controller.js', 'controllers/notification.controller.js',
        'lib/activite.js', 'lib/audit.js',
    ]);
    assert.ok(!/entity_id/.test(lire('src/app/ui/pages/Audit.jsx')), 'l\'écran du journal ne l\'affiche pas');

    /* Le seul endroit où sa VALEUR sert : le lien de la cloche. Il ne se construit que pour un
       stagiaire, une entreprise ou une session — trois entités toujours désignées par un UUID.
       Un slug ou un nom de rôle ne devient donc jamais une adresse. */
    assert.strictEqual(lienDeLEntite('DocumentTemplate', 'grille-jury'), null);
    assert.strictEqual(lienDeLEntite('AccessProfile', 'FORMATEUR'), null);
    const id = crypto.randomUUID();
    assert.strictEqual(lienDeLEntite('Learner', id), `/stagiaires/${id}`);
});

// ── Les contrôleurs, sur la colonne déclarée ────────────────────────────────────────────────

test('enregistrer un modèle laisse sa trace, slug compris', async () => {
    base = nouvelleBase({ modeles: [{ id: 't1', organization_id: 'o1', slug: 'droit-image' }] });
    const res = reponse();
    await console_(() => tpl.saveTemplate(requete({ params: { slug: 'droit-image' }, body: { label: 'Droit à l’image' } }), res));
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(traces(), [['template.save', 'DocumentTemplate', 'droit-image']]);
    // Écrite du premier coup : la colonne ne l'a pas refusée.
    assert.strictEqual(base.tentatives.length, 1);
});

test('poser les modèles du jury, réinitialiser un modèle : la trace nomme le modèle', async () => {
    base = nouvelleBase();
    const res = reponse();
    await console_(() => tpl.poserModelesJury(requete(), res));
    assert.deepStrictEqual(res.corps.data.poses, MODELES_JURY.map((m) => m.slug));
    assert.deepStrictEqual(traces(), MODELES_JURY.map((m) => ['template.save', 'DocumentTemplate', m.slug]));
    assert.ok(traces().some(([, , id]) => id === 'grille-jury'));

    base = nouvelleBase();
    await console_(() => tpl.resetTemplate(requete({ params: { slug: 'grille-jury' } }), reponse()));
    assert.deepStrictEqual(traces(), [['template.reset', 'DocumentTemplate', 'grille-jury']]);
});

test('personnaliser un rôle système laisse sa trace, nom du rôle compris', async () => {
    base = nouvelleBase();
    const res = reponse();
    await console_(() => roles.upsertSystemRole(requete({ params: { role: 'FORMATEUR' }, body: { color: '#123456' } }), res));
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(traces(), [['accessprofile.system', 'AccessProfile', 'FORMATEUR']]);
});

test('les appels qui désignent un modèle par son slug sont ceux que la 175 couvre', () => {
    /* L'inventaire du 2026-09-22 : un modèle se désigne TOUJOURS par son slug. Si un appel de
       plus apparaît, sa valeur est un slug, borné comme les autres par document_template.slug. */
    const src = lire('src/api/controllers/template.controller.js');
    const appels = [...src.matchAll(/logAudit\(req, ([^,]+), 'DocumentTemplate', ([^)]+)\)/g)].map((m) => [m[1], m[2]]);
    assert.deepStrictEqual(appels, [
        ["'template.save'", 'slug'],
        ["'template.upload'", 'slug'],
        ["'template.delete'", 'slug'],
        ["permanent ? 'template.delete' : 'template.reset'", 'slug'],
        ["'template.duplicate'", 'slug'],
        ["'template.reorder'", 'null'],
        ["'template.save'", 'm.slug'],
    ]);
});

// ── logAudit, avant et après la migration ───────────────────────────────────────────────────

test('après la 175 : le slug part tel quel, en sixième paramètre de l\'INSERT', async () => {
    const logAudit = auditNeuf();
    base = nouvelleBase({ typeEntityId: 'varchar(64)' });
    const sortie = await console_(() => logAudit(requete(), 'template.save', 'DocumentTemplate', 'droit-image'));
    assert.strictEqual(base.tentatives.length, 1);
    const [id, ...reste] = base.tentatives[0];
    assert.match(id, UUID, 'la ligne a son propre identifiant');
    assert.deepStrictEqual(reste, ['o1', 'u1', 'template.save', 'DocumentTemplate', 'droit-image']);
    assert.deepStrictEqual(sortie, []);
});

test('avant la 175 : la ligne est gardée SANS son identifiant, et la console le dit une fois', async () => {
    const logAudit = auditNeuf();
    base = nouvelleBase({ typeEntityId: 'uuid' });  // la colonne d'avant la migration
    const uuid = crypto.randomUUID();
    const sortie = await console_(async () => {
        for (const slug of ['droit-image', 'grille-jury', 'pv-jury']) {
            await logAudit(requete(), 'template.save', 'DocumentTemplate', slug);
        }
        await logAudit(requete(), 'learner.update', 'Learner', uuid);
    });
    // Trois modèles tracés — qui, quoi, quand — sans leur slug. Le stagiaire, lui, garde son UUID.
    assert.deepStrictEqual(traces(), [
        ['template.save', 'DocumentTemplate', null],
        ['template.save', 'DocumentTemplate', null],
        ['template.save', 'DocumentTemplate', null],
        ['learner.update', 'Learner', uuid],
    ]);
    // Chaque slug a d'abord été tenté, puis la MÊME ligne (même id) réécrite sans lui.
    assert.strictEqual(base.tentatives.length, 7);
    assert.strictEqual(base.tentatives[0][5], 'droit-image');
    assert.strictEqual(base.tentatives[1][5], null);
    assert.strictEqual(base.tentatives[1][0], base.tentatives[0][0]);
    // UNE ligne de console pour les trois, qui dit la conséquence et le remède.
    assert.strictEqual(sortie.length, 1, sortie.join('\n'));
    assert.match(sortie[0], /entity_id refuse « droit-image » \(template\.save\)/);
    assert.match(sortie[0], /SANS son identifiant/);
    assert.match(sortie[0], /jouer la migration 175/);
});

test('un identifiant trop long pour la colonne : la ligne reste, sans lui', async () => {
    const logAudit = auditNeuf();
    base = nouvelleBase({ typeEntityId: 'varchar(64)' });
    const sortie = await console_(() => logAudit(requete(), 'template.reset', 'DocumentTemplate', 'x'.repeat(65)));
    assert.deepStrictEqual(traces(), [['template.reset', 'DocumentTemplate', null]]);
    // La console dit la vraie cause : ce n'est plus la migration qui manque.
    assert.strictEqual(sortie.length, 1);
    assert.match(sortie[0], /dépasse les 64 caractères/);
    assert.doesNotMatch(sortie[0], /migration 175/);
});

test('une autre panne : pas de second essai, une ligne de console, et jamais d\'exception', async () => {
    const logAudit = auditNeuf();
    base = nouvelleBase({
        panne: Object.assign(new Error('Table \'impastio.audit_log\' doesn\'t exist'), { code: 'ER_NO_SUCH_TABLE' }),
    });
    const sortie = await console_(async () => {
        await logAudit(requete(), 'template.save', 'DocumentTemplate', 'droit-image');
        await logAudit(requete(), 'learner.update', 'Learner', crypto.randomUUID());
    });
    // La panne ne tient pas à l'identifiant : le réécrire sans lui ne servirait à rien.
    assert.strictEqual(base.tentatives.length, 2);
    assert.strictEqual(sortie.length, 1, sortie.join('\n'));
    assert.match(sortie[0], /trace « template\.save » perdue — Table 'impastio\.audit_log' doesn't exist/);

    /* Non bloquant veut dire : rien ne remonte à l'appelant, ni exception ni promesse rejetée —
       pas même quand db.query lève, ni quand la requête n'a pas d'utilisateur. */
    base = nouvelleBase({ lance: true });
    await console_(async () => {
        let promesse;
        assert.doesNotThrow(() => { promesse = logAudit(requete(), 'template.save', 'DocumentTemplate', 'x'); });
        await assert.doesNotReject(promesse);
        await assert.doesNotReject(logAudit(undefined, 'template.save'));
        await assert.doesNotReject(logAudit({}, 'template.save'));
    });
});

// ── Les appels : quatre arguments à plat ────────────────────────────────────────────────────

test('logAudit reçoit ses arguments À PLAT : jamais un objet pour l\'action ni pour l\'identifiant', () => {
    /* `logAudit(req, { action, entity, entityId })` passe sans la moindre erreur : la colonne
       `action` reçoit « [object Object] », l'entité et l'identifiant restent vides. Les tests de
       libellés lisent les codes par des motifs `logAudit(req, '…'` : un appel en objet leur était
       INVISIBLE — c'est ainsi que les trois des catégories de partenaires ont échappé à tout
       contrôle, après que le consentement de l'espace stagiaire eut été corrigé du même défaut. */
    let appels = 0;
    const fautifs = [];
    for (const [rel, brut] of sourcesApi()) {
        const src = sansCommentaires(brut);
        const ligne = (i) => `${rel}:${src.slice(0, i).split('\n').length}`;
        for (const m of src.matchAll(/logAudit\(\s*req\s*,\s*(\S)/g)) {
            appels += 1;
            if (m[1] === '{' || m[1] === '[') fautifs.push(`${ligne(m.index)} : l'action est un objet`);
        }
        for (const m of src.matchAll(/logAudit\(\s*req\s*,[^,]+,[^,]+,\s*[{[]/g)) {
            fautifs.push(`${ligne(m.index)} : l'identifiant est un objet`);
        }
    }
    // Le compte protège le test lui-même : un motif qui ne trouverait plus rien passerait au vert.
    assert.ok(appels >= 139, `appels de logAudit trouvés : ${appels}`);
    assert.deepStrictEqual(fautifs, []);
});

test('les catégories de partenaires : le journal dit ce qui s\'est passé, et sur quoi', async () => {
    base = nouvelleBase();
    const cree = reponse();
    await console_(() => partenaires.createPartnerCategory(requete({ body: { label: 'Meuniers' } }), cree));
    assert.strictEqual(cree.code, 201);
    const id = cree.corps.data.id;
    assert.match(id, UUID);

    base.categories.push({ id, organization_id: 'o1', code: 'MEUNIERS', label: 'Meuniers' });
    await console_(() => partenaires.updatePartnerCategory(requete({ params: { cid: id }, body: { label: 'Minoteries' } }), reponse()));
    await console_(() => partenaires.deletePartnerCategory(requete({ params: { cid: id } }), reponse()));
    assert.deepStrictEqual(traces(), [
        ['CREATE', 'partner_category', id],
        ['UPDATE', 'partner_category', id],
        ['DELETE', 'partner_category', id],
    ]);
});

// ── La migration et son revert ──────────────────────────────────────────────────────────────

test('le revert efface ce qu\'un uuid ne peut pas contenir, AVANT de rétrécir la colonne', () => {
    const r = code(REV);
    const iEfface = r.indexOf('UPDATE audit_log');
    const iRetrecit = r.indexOf('MODIFY COLUMN entity_id uuid DEFAULT NULL');
    assert.ok(iEfface >= 0 && iRetrecit > iEfface, 'l\'UPDATE passe avant l\'ALTER');
    const motif = r.match(/SET entity_id = NULL\s+WHERE entity_id IS NOT NULL\s+AND entity_id NOT RLIKE '([^']+)'/);
    assert.ok(motif, 'seules les valeurs qui ne sont pas des UUID passent à NULL');
    // Le motif garde les UUID — en minuscules comme en majuscules — et efface tout le reste.
    const estGarde = new RegExp(motif[1]);
    assert.ok(estGarde.test(crypto.randomUUID()));
    assert.ok(estGarde.test(crypto.randomUUID().toUpperCase()));
    for (const v of ['grille-jury', 'FORMATEUR', 'x'.repeat(36), `${crypto.randomUUID()}-copie`]) {
        assert.ok(!estGarde.test(v), `« ${v} » ne tient pas dans un uuid`);
    }
    // Il dit ce qu'il perd : l'identifiant, pas la ligne.
    assert.match(REV, /CE QUI SE PERD : l'IDENTIFIANT/);
    assert.match(REV, /La LIGNE reste/);
});

test('la migration 175 et son revert passent le client SQL de l\'organisme', () => {
    // Un point-virgule par instruction et aucun ailleurs (la 146), aucune barre oblique inverse (la 166).
    for (const [nom, sql, instructions] of [['aller', MIG, 1], ['revert', REV, 2]]) {
        const commentaires = (sql.match(/\/\*[\s\S]*?\*\//g) || []).join('');
        const chaines = (code(sql).match(/'[^']*'/g) || []).join('');
        assert.ok(!commentaires.includes(';') && !chaines.includes(';'), `${nom} : point-virgule hors fin d'instruction`);
        assert.strictEqual((sql.match(/;/g) || []).length, instructions, `${nom} : ${instructions} instruction(s)`);
        assert.ok(!sql.includes('\\'), `${nom} : aucune barre oblique inverse`);
        assert.ok(!/(^|\n)\s*--/.test(sql), `${nom} : commentaires en blocs, jamais en --`);
    }
});
