/**
 * LES FICHES ENTREPRISE, PASSÉES AU REGISTRE : complétées, ou supprimées (demandé le 2026-09-22).
 *
 * « Vérifie chaque entreprise : si tu ne trouves rien, supprime-la ; sinon complète-la avec ce que
 * tu trouves sur Pappers ou societe.com. S'il y a déjà quelqu'un de rattaché, n'y touche pas. »
 * La source est l'annuaire officiel, que ces deux sites republient ; les règles de décision vivent
 * dans src/api/lib/registreEntreprises.js. Ce script, lui, lit et écrit la base.
 *
 * « QUELQU'UN Y EST RATTACHÉ », AU SENS LARGE (`ATTACHES`) : un stagiaire, une inscription, une
 * facture, un document, une vente de matériel, un compte de représentant, un cachet déposé, ou un
 * stagiaire dont l'e-mail est celui de l'entreprise (le référent est un stagiaire, cf.
 * getCompanies). Une seule attache, et la fiche n'est ni complétée ni supprimée. Les clés
 * étrangères sont en ON DELETE SET NULL : supprimer une entreprise rattachée ne lèverait aucune
 * erreur, elle DÉTACHERAIT en silence ses factures et ses documents.
 *
 * EN DEUX TEMPS, ET RÉVERSIBLE :
 *   1. l'ESSAI — le mode par défaut — interroge le registre, n'écrit RIEN en base, et dépose un
 *      plan et son rapport. Relire le rapport ;
 *   2. --appliquer <plan> exécute CE plan et rien d'autre : ce qu'on a relu est ce qui s'écrit, sans
 *      nouvel appel au registre. Il sauvegarde d'abord les fiches visées — sans sauvegarde, il
 *      n'écrit rien —, puis saute toute fiche modifiée ou rattachée depuis l'essai ;
 *   3. --restaurer <sauvegarde> remet les fiches supprimées et retire ce qui a été ajouté, sauf ce
 *      qui a été modifié depuis.
 * Le défaut est l'essai, et non l'écriture comme dans les scripts de chiffrement : celui-ci
 * SUPPRIME, et une commande lancée sans option ne doit rien pouvoir détruire.
 *
 *   sudo -u impastio node /opt/impastio/database/tools/completer-entreprises.js                 # essai
 *   sudo -u impastio node /opt/impastio/database/tools/completer-entreprises.js --limite 20     # essai sur 20 fiches
 *   sudo systemctl start impastio-sauvegarde                                                      # la base entière, par prudence
 *   sudo -u impastio node /opt/impastio/database/tools/completer-entreprises.js --appliquer <plan.json>
 *   sudo -u impastio node /opt/impastio/database/tools/completer-entreprises.js --restaurer <sauvegarde.json>
 *   … --organisme CODE   s'il y a plusieurs organismes en base
 *   … --dossier /chemin  où poser plan, rapport et sauvegarde (défaut : /tmp/impastio-entreprises)
 *
 * Le CHEMIN ABSOLU compte (cf. chiffrer-france-travail.js). Plan et sauvegarde portent des noms et
 * des adresses : fichiers en 600, dossier en 700.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('../../src/api/config/database.js');
const { analyser } = require('../../src/api/lib/registreEntreprises.js');

const REGISTRE = 'https://recherche-entreprises.api.gouv.fr/search';
const VERSION = 1;
const PLAN_VALIDE_JOURS = 7;

const argument = (nom) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : undefined; };
const attendreMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * L'appel au registre. Sept appels par seconde sont permis : on en fait quatre au plus, et l'on
 * réessaie sur 429 et 5xx, en doublant l'attente. Après cinq échecs, on LÈVE : l'analyse classe la
 * fiche « en erreur », jamais « introuvable » — une panne ne supprime rien.
 */
function registre({ fetchFn = globalThis.fetch, pause = 250, essais = 5, attendre = attendreMs } = {}) {
    let dernier = 0;
    return async function chercher(params) {
        for (let n = 0; ; n++) {
            const ecoule = Date.now() - dernier;
            if (ecoule < pause) await attendre(pause - ecoule);
            dernier = Date.now();
            // Quinze secondes au plus, lecture de la réponse comprise : un registre qui traîne est en panne.
            const ctrl = new AbortController();
            const minuterie = setTimeout(() => ctrl.abort(), 15000);
            let rep = null;
            try {
                rep = await fetchFn(`${REGISTRE}?${new URLSearchParams({ ...params, per_page: '25' })}`, {
                    headers: { 'User-Agent': 'Impastio (complétion des fiches entreprise)' },
                    signal: ctrl.signal,
                });
                if (rep.ok) return await rep.json();
            } catch (e) {
                if (n + 1 >= essais) throw e;
                await attendre(1000 * 2 ** n);
                continue;
            } finally {
                clearTimeout(minuterie);
            }
            if ((rep.status === 429 || rep.status >= 500) && n + 1 < essais) { await attendre(1000 * 2 ** n); continue; }
            throw new Error(`HTTP ${rep.status}`);
        }
    };
}

/* Les attaches, en SQL sur l'alias `c` de company. Chacune ne compte que si sa colonne existe : une
   table absente ne rattache rien. */
const ATTACHES = [
    ['stagiaires', 'learner.company_id', 'EXISTS (SELECT 1 FROM learner x WHERE x.company_id = c.id)'],
    ['inscriptions', 'enrollment.company_id', 'EXISTS (SELECT 1 FROM enrollment x WHERE x.company_id = c.id)'],
    ['factures', 'invoice.company_id', 'EXISTS (SELECT 1 FROM invoice x WHERE x.company_id = c.id)'],
    ['documents', 'generated_document.company_id', 'EXISTS (SELECT 1 FROM generated_document x WHERE x.company_id = c.id)'],
    ['ventes de matériel', 'material_sale.company_id', 'EXISTS (SELECT 1 FROM material_sale x WHERE x.company_id = c.id)'],
    ['compte de représentant', 'company.user_id', 'c.user_id IS NOT NULL'],
    ['cachet', 'company.stamp', "(c.stamp IS NOT NULL AND c.stamp <> '')"],
    ['référent stagiaire', 'learner.email',
        "EXISTS (SELECT 1 FROM learner x WHERE x.organization_id = c.organization_id AND c.email <> '' AND x.email = c.email)"],
];
const TABLES = ['company', 'learner', 'enrollment', 'invoice', 'generated_document', 'material_sale'];

/** Les attaches vérifiables dans CETTE base. Sans introspection, on s'arrête : rien ne serait sûr. */
async function attaches(conn) {
    const [cols] = await conn.query(
        `SELECT table_name AS t, column_name AS c FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name IN (${TABLES.map(() => '?').join(', ')})`, TABLES);
    const la = new Set(cols.map((x) => `${x.t}.${x.c}`));
    if (!la.has('company.id') || !la.has('company.email')) throw new Error('table company illisible : ARRÊT, rien ne peut être vérifié');
    const liens = ATTACHES.filter(([, col]) => la.has(col)).map(([nom, , sql]) => ({ nom, sql }));
    // Sans le rattachement des stagiaires, la règle même de l'utilisateur ne se vérifie pas : on ne supprime pas à l'aveugle.
    if (!liens.some((l) => l.nom === 'stagiaires')) throw new Error('learner.company_id introuvable : ARRÊT, les rattachements ne se vérifient pas');
    return liens;
}

/* Les colonnes de company, les dates LUES EN TEXTE : la sauvegarde doit se réécrire à l'identique,
   et une date passée par JSON reviendrait en « …T…Z », que MariaDB ne relit pas tel quel. */
async function colonnesCompany(conn) {
    const [cols] = await conn.query(
        `SELECT column_name AS c, data_type AS t FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'company' ORDER BY ordinal_position`);
    if (!cols.length) throw new Error('table company illisible : ARRÊT');
    return cols.map((x) => ({ nom: x.c, date: /^(date|datetime|timestamp|time)$/i.test(x.t) }));
}
const selectCompany = (cols) => cols.map(({ nom, date }) => (date ? `CAST(c.\`${nom}\` AS CHAR) AS \`${nom}\`` : `c.\`${nom}\``)).join(', ');

/** L'empreinte d'une fiche : si elle a bougé entre l'essai et l'application, on n'y touche pas. */
const empreinte = (ligne) => crypto.createHash('sha256')
    .update(JSON.stringify(Object.keys(ligne).sort().map((k) => [k, ligne[k] == null ? null : String(ligne[k])])))
    .digest('hex');

/** L'organisme visé : le seul, ou celui de `--organisme`. */
async function organismeVise(conn, code) {
    const [orgs] = await conn.query('SELECT id, code, legal_name FROM organization ORDER BY legal_name');
    if (code) {
        const o = orgs.find((x) => String(x.code || '').toUpperCase() === String(code).toUpperCase());
        if (!o) throw new Error(`organisme « ${code} » introuvable`);
        return o;
    }
    if (orgs.length === 1) return orgs[0];
    throw new Error(`${orgs.length} organismes en base : préciser --organisme CODE (${orgs.map((o) => o.code || o.legal_name).join(', ')})`);
}

/**
 * L'ESSAI : aucune écriture en base. Les fiches rattachées ne partent même pas au registre.
 * → le plan : { version, cree_le, organisme, limite, entreprises: [{ id, nom, lieu, action, … }] }
 */
async function essai(conn, { organisme, chercher, limite = 0, progression = () => {} }) {
    const cols = await colonnesCompany(conn);
    const liens = await attaches(conn);
    const [lignes] = await conn.query(
        `SELECT ${selectCompany(cols)}${liens.map((l, i) => `, ${l.sql} AS lien_${i}`).join('')}
           FROM company c WHERE c.organization_id = ? ORDER BY c.name`, [organisme.id]);
    const plan = { version: VERSION, cree_le: new Date().toISOString(), organisme: { id: organisme.id, code: organisme.code || null },
        limite: limite || null, attaches_verifiees: liens.map((l) => l.nom), entreprises: [] };
    const aExaminer = lignes.filter((l) => !liens.some((_, i) => Number(l[`lien_${i}`]) === 1));
    let vues = 0;
    for (const l of lignes) {
        const ligne = Object.fromEntries(cols.map(({ nom }) => [nom, l[nom]]));
        const base = { id: ligne.id, nom: ligne.name, lieu: `${ligne.zip_code || ''} ${ligne.town || ''}`.trim() };
        const siennes = liens.filter((_, i) => Number(l[`lien_${i}`]) === 1).map((x) => x.nom);
        if (siennes.length) { plan.entreprises.push({ ...base, action: 'rattachee', attaches: siennes }); continue; }
        if (limite && vues >= limite) continue;
        vues++;
        const d = await analyser(ligne, chercher);
        // Seulement les colonnes que CETTE base porte (date_creation arrive avec la 159).
        if (d.champs) {
            const brut = d.champs;
            d.champs = Object.fromEntries(Object.entries(brut).filter(([k]) => cols.some((c) => c.nom === k)));
            // Sans la 174, pas de colonne pour le prénom : il rejoint le nom, dans la forme d'avant.
            if (brut.representative_first_name && d.champs.representative_name && !('representative_first_name' in d.champs)) {
                d.champs.representative_name = `${brut.representative_first_name} ${d.champs.representative_name}`.toLocaleUpperCase('fr');
            }
        }
        if (d.action === 'completer' && !Object.keys(d.champs).length) d.action = 'deja_complete';
        plan.entreprises.push({ ...base, empreinte: empreinte(ligne), ...d });
        progression(vues, limite ? Math.min(limite, aExaminer.length) : aExaminer.length);
    }
    return plan;
}

const LIBELLES = { siret: 'SIRET', naf_ape: 'NAF', legal_status: 'forme', date_creation: 'création', address: 'adresse',
    zip_code: 'CP', town: 'ville', representative_name: 'référent', representative_role: 'fonction' };
/* Les champs d'une fiche à compléter, lisibles : le prénom se lit AVEC le nom — « référent Paul MARTIN ». */
const champsLisibles = (champs) => Object.entries(champs)
    .filter(([k]) => k !== 'representative_first_name')
    .map(([k, v]) => `${LIBELLES[k] || k} ${k === 'representative_name' ? [champs.representative_first_name, v].filter(Boolean).join(' ') : v}`)
    .join(' · ');
const candidat = (c) => `${c.nom} (SIRET ${c.siret}, ${c.commune}, ${c.etat})`;

/** Le rapport lisible d'un plan : les comptes, puis chaque fiche qui bouge ou qui attend un humain. */
function rapport(plan) {
    const par = (a) => plan.entreprises.filter((e) => e.action === a);
    const rattachees = par('rattachee');
    const examinees = plan.entreprises.filter((e) => e.action !== 'rattachee');
    const sup = par('supprimer');
    const fermees = sup.filter((e) => /fermée/.test(e.motif)).length;
    const detail = new Map();
    for (const e of rattachees) for (const a of e.attaches) detail.set(a, (detail.get(a) || 0) + 1);
    const L = [];
    L.push(`Entreprises de l'organisme ${plan.organisme.code || plan.organisme.id} — plan du ${plan.cree_le}`);
    // Dans l'ordre des attaches, pas dans celui où on les a rencontrées : deux rapports se comparent.
    const ordre = (plan.attaches_verifiees || []).filter((a) => detail.has(a));
    L.push(`  ${rattachees.length} rattachées : on n'y touche pas (${ordre.map((a) => `${a} ${detail.get(a)}`).join(', ') || 'aucune'})`);
    L.push(`  ${examinees.length} examinées au registre${plan.limite ? ` (essai limité à ${plan.limite})` : ''} :`);
    L.push(`     ${par('completer').length} à compléter`);
    L.push(`     ${par('deja_complete').length} déjà complètes`);
    L.push(`     ${sup.length} à supprimer (${sup.length - fermees} introuvables, ${fermees} fermées)`);
    L.push(`     ${par('a_verifier').length} à vérifier à la main (on n'y touche pas)`);
    L.push(`     ${par('erreur').length} en erreur (registre injoignable : relancer l'essai)`);
    const bloc = (titre, liste, ligne) => { if (liste.length) { L.push('', `${titre} (${liste.length})`); for (const e of liste) L.push(`  · ${ligne(e)}`); } };
    const qui = (e) => `${e.nom}${e.lieu ? ` — ${e.lieu}` : ''}`;
    bloc('À SUPPRIMER', sup, (e) => `${qui(e)} — ${e.motif}`);
    bloc('À COMPLÉTER', par('completer'), (e) => `${qui(e)} → ${champsLisibles(e.champs)}`);
    bloc('À VÉRIFIER À LA MAIN', par('a_verifier'), (e) => `${qui(e)} — ${e.motif}${e.candidats?.length ? ` : ${e.candidats.map(candidat).join(' ; ')}` : ''}`);
    bloc('EN ERREUR', par('erreur'), (e) => `${qui(e)} — ${e.motif}`);
    return L.join('\n');
}

function preparerDossier(dossier) {
    fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
    fs.accessSync(dossier, fs.constants.W_OK);
    return dossier;
}
const horodatage = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');
/** `wx` : ne JAMAIS écraser un fichier existant — une sauvegarde précédente moins que tout autre. */
function ecrire(dossier, nom, contenu) {
    const f = path.join(dossier, nom);
    fs.writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1), { mode: 0o600, flag: 'wx' });
    return f;
}

/**
 * APPLIQUE un plan relu. La sauvegarde des fiches visées d'abord ; si elle échoue, rien ne s'écrit.
 * Chaque écriture porte ses propres gardes : la fiche n'est toujours rattachée à rien (les mêmes
 * attaches qu'à l'essai), et un champ n'est écrit que s'il est encore vide.
 */
async function appliquer(conn, { plan, dossier, maintenant = new Date() }) {
    if (!plan || plan.version !== VERSION) throw new Error('plan illisible, ou d\'une autre version de ce script');
    const age = (maintenant - new Date(plan.cree_le)) / 86400000;
    if (!(age >= 0 && age <= PLAN_VALIDE_JOURS)) throw new Error(`plan du ${plan.cree_le} : plus de ${PLAN_VALIDE_JOURS} jours, relancer l'essai`);
    const [[org]] = await conn.query('SELECT id FROM organization WHERE id = ?', [plan.organisme.id]);
    if (!org) throw new Error('l\'organisme de ce plan n\'existe pas dans cette base');
    const cibles = plan.entreprises.filter((e) => e.action === 'completer' || e.action === 'supprimer');
    const bilan = { supprimees: [], completees: [], sautees: [] };
    if (!cibles.length) return { bilan, sauvegarde: null };

    const cols = await colonnesCompany(conn);
    const noms = new Set(cols.map((c) => c.nom));
    const liens = await attaches(conn);
    const garde = liens.map((l) => `NOT ${l.sql}`).join(' AND ');
    const [lignes] = await conn.query(
        `SELECT ${selectCompany(cols)} FROM company c WHERE c.organization_id = ? AND c.id IN (?)`, [plan.organisme.id, cibles.map((e) => e.id)]);
    const avant = new Map(lignes.map((l) => [l.id, l]));
    const sauvegarde = ecrire(dossier, `sauvegarde-${horodatage(maintenant)}.json`, {
        version: VERSION, sauvee_le: maintenant.toISOString(), organisme: plan.organisme,
        entreprises: cibles.map((e) => ({ id: e.id, nom: e.nom, action: e.action, champs: e.champs || null, ligne: avant.get(e.id) || null })),
    });

    for (const e of cibles) {
        const l = avant.get(e.id);
        if (!l) { bilan.sautees.push({ ...e, raison: 'n\'existe plus' }); continue; }
        if (empreinte(l) !== e.empreinte) { bilan.sautees.push({ ...e, raison: 'modifiée depuis l\'essai' }); continue; }
        if (e.action === 'supprimer') {
            const [r] = await conn.query(`DELETE c FROM company c WHERE c.id = ? AND c.organization_id = ? AND ${garde}`, [e.id, plan.organisme.id]);
            if (r.affectedRows === 1) bilan.supprimees.push(e); else bilan.sautees.push({ ...e, raison: 'rattachée depuis l\'essai' });
            continue;
        }
        let ecrits = 0;
        for (const [k, v] of Object.entries(e.champs || {})) {
            if (!noms.has(k)) continue;
            // Un SIRET qui n'en était pas un (SIREN, « en cours ») : remplacé seulement s'il n'a pas bougé.
            const remplace = k === 'siret' && l.siret != null && String(l.siret).trim() !== '';
            const [r] = await conn.query(
                `UPDATE company c SET c.\`${k}\` = ? WHERE c.id = ? AND c.organization_id = ?
                    AND ${remplace ? 'c.siret = ?' : `(c.\`${k}\` IS NULL OR TRIM(c.\`${k}\`) = '')`} AND ${garde}`,
                remplace ? [v, e.id, plan.organisme.id, l.siret] : [v, e.id, plan.organisme.id]);
            ecrits += r.affectedRows;
        }
        if (ecrits) bilan.completees.push(e); else bilan.sautees.push({ ...e, raison: 'rattachée ou remplie depuis l\'essai' });
    }
    return { bilan, sauvegarde };
}

/**
 * RESTAURE depuis une sauvegarde : les fiches supprimées reviennent telles quelles (même id — rien
 * ne s'y rattachait) ; les champs ajoutés sont retirés, SEULEMENT s'ils valent encore ce que le
 * script y a écrit : une correction faite depuis à la main n'est pas défaite.
 */
async function restaurer(conn, { sauvegarde }) {
    if (!sauvegarde || sauvegarde.version !== VERSION) throw new Error('sauvegarde illisible, ou d\'une autre version de ce script');
    const noms = new Set((await colonnesCompany(conn)).map((c) => c.nom));
    const bilan = { reinserees: 0, champs_retires: 0 };
    for (const e of sauvegarde.entreprises) {
        if (!e.ligne) continue;
        if (e.action === 'supprimer') {
            const [deja] = await conn.query('SELECT id FROM company WHERE id = ?', [e.id]);
            if (deja.length) continue; // jamais supprimée (sautée), ou déjà remise
            const k = Object.keys(e.ligne).filter((x) => noms.has(x));
            await conn.query(`INSERT INTO company (${k.map((x) => `\`${x}\``).join(', ')}) VALUES (${k.map(() => '?').join(', ')})`,
                k.map((x) => e.ligne[x]));
            bilan.reinserees++;
        } else if (e.action === 'completer') {
            for (const [k, v] of Object.entries(e.champs || {})) {
                if (!noms.has(k)) continue;
                const [r] = await conn.query(`UPDATE company SET \`${k}\` = ? WHERE id = ? AND \`${k}\` <=> ?`, [e.ligne[k] ?? null, e.id, v]);
                bilan.champs_retires += r.affectedRows;
            }
        }
    }
    return bilan;
}

if (require.main === module) (async () => {
    const conn = db.promise();
    const dossier = argument('--dossier') || path.join(os.tmpdir(), 'impastio-entreprises');
    const lire = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
    try {
        if (process.argv.includes('--restaurer')) {
            const f = argument('--restaurer');
            if (!f) throw new Error('--restaurer attend le chemin d\'une sauvegarde');
            console.log('\nFiches entreprise — RESTAURATION\n');
            const b = await restaurer(conn, { sauvegarde: lire(f) });
            console.log(`  ${b.reinserees} fiche(s) remise(s), ${b.champs_retires} champ(s) ajouté(s) retiré(s).\n`);
        } else if (process.argv.includes('--appliquer')) {
            const f = argument('--appliquer');
            if (!f) throw new Error('--appliquer attend le chemin d\'un plan (produit par l\'essai)');
            console.log('\nFiches entreprise — APPLICATION du plan\n');
            const { bilan, sauvegarde } = await appliquer(conn, { plan: lire(f), dossier: preparerDossier(dossier) });
            if (sauvegarde) console.log(`  Sauvegarde : ${sauvegarde}`);
            console.log(`  ${bilan.supprimees.length} supprimée(s), ${bilan.completees.length} complétée(s), ${bilan.sautees.length} sautée(s).`);
            for (const e of bilan.sautees) console.log(`    · sautée : ${e.nom} — ${e.raison}`);
            if (sauvegarde) console.log(`\n  Pour revenir en arrière : sudo -u impastio node ${__filename} --restaurer ${sauvegarde}`);
            console.log('');
        } else {
            preparerDossier(dossier);
            const organisme = await organismeVise(conn, argument('--organisme'));
            const limite = Number(argument('--limite')) || 0;
            console.log(`\nFiches entreprise — ESSAI (rien n'est écrit en base) — ${organisme.code || organisme.legal_name}\n`);
            const plan = await essai(conn, {
                organisme, chercher: registre(), limite,
                progression: (n, total) => { if (n % 25 === 0 || n === total) console.log(`  … ${n} / ${total} examinées`); },
            });
            const h = horodatage();
            const texte = rapport(plan);
            const fichierPlan = ecrire(dossier, `plan-${h}.json`, plan);
            const fichierRapport = ecrire(dossier, `rapport-${h}.txt`, `${texte}\n`);
            console.log(`\n${texte}\n`);
            console.log(`  Rapport : ${fichierRapport}`);
            console.log(`  Plan    : ${fichierPlan}`);
            console.log(`\n  Après relecture : sudo systemctl start impastio-sauvegarde`);
            console.log(`  puis             sudo -u impastio node ${__filename} --appliquer ${fichierPlan}\n`);
        }
    } catch (err) {
        console.error('\nÉchec :', err.message, '\n');
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

module.exports = { essai, appliquer, restaurer, rapport, registre, attaches, colonnesCompany, empreinte, organismeVise, ATTACHES, VERSION };
