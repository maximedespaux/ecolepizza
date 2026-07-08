#!/usr/bin/env node
/**
 * Importe des PDF historiques dans le coffre documentaire (table archive_document),
 * classés année / semaine / formation (déduite) / stagiaire.
 *
 * Structure attendue des dossiers :  <racine>/<ANNÉE>/SEM <n>/<STAGIAIRE>/....pdf
 * (le niveau « formation » n'existe pas en dossier : il est déduit des noms de fichiers).
 *
 * Règles : seuls les .pdf sont importés ; un stagiaire ayant moins de 2 PDF est ignoré.
 * Ré-exécutable : un document déjà importé (même année/semaine/stagiaire/titre) est sauté.
 *
 * Usage :
 *   node scripts/import-archive.js <dossier_racine> [CODE_ORGANISME] [--dry-run]
 *
 * Ex :  node scripts/import-archive.js "/Users/moi/Downloads/drive-download-.../" EPB33
 *       node scripts/import-archive.js "/Users/moi/Downloads/drive-download-.../" --dry-run
 *
 * Prérequis : migration 027_archive_document.sql appliquée ; src/api/config/.env configuré.
 */
const fs = require('fs');
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'api', 'config', 'database.js'));

// --- Déduction de la formation depuis les noms de fichiers d'un stagiaire ---
function inferFormation(names) {
    const b = names.join(' ').toLowerCase();
    if (/niveau ii|niv\.?\s*ii|niveau 2/.test(b)) return 'Niveau II';
    if (/rs\s*7404|rs74|fabriquer des pizzas artisanales/.test(b)) return 'Fabriquer des pizzas artisanales (RS7404)';
    if (/teglia/.test(b)) return 'Teglia';
    if ((/niveau i\s*pro|\bpro\b/.test(b)) && b.includes('niveau i')) return 'Niveau I PRO';
    if (b.includes('niveau i') || b.includes('niveau 1')) return /hygièn|hygien/.test(b) ? 'Niveau I + Hygiène' : 'Niveau I';
    if (/hygièn|hygien/.test(b)) return 'Hygiène';
    return 'À préciser';
}
const surnameFrom = (fn) => (fn.match(/\b([A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/) || [])[1] || null;

// Liste récursive des fichiers d'un dossier.
function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else out.push(p);
    }
    return out;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const rest = args.filter((a) => a !== '--dry-run');
    const root = rest[0];
    const orgCode = rest[1];
    if (!root || !fs.existsSync(root)) {
        console.error('Dossier racine introuvable. Usage : node scripts/import-archive.js <dossier_racine> [CODE_ORGANISME] [--dry-run]');
        process.exit(1);
    }
    const conn = db.promise();

    // Résolution de l'organisme.
    let orgId;
    if (orgCode) {
        const [[o]] = await conn.query('SELECT id FROM organization WHERE code = ?', [orgCode.toUpperCase()]);
        if (!o) { console.error(`Aucun organisme avec le code « ${orgCode} ».`); process.exit(1); }
        orgId = o.id;
    } else {
        const [orgs] = await conn.query('SELECT id, legal_name FROM organization');
        if (orgs.length !== 1) { console.error(`Précisez le CODE_ORGANISME (organismes trouvés : ${orgs.length}).`); process.exit(1); }
        orgId = orgs[0].id;
        console.log(`Organisme : ${orgs[0].legal_name}`);
    }

    // Regroupe les PDF par (année, semaine, stagiaire).
    const groups = new Map(); // clé "year|week|stagiaire" -> { year, week, stagiaire, files:[{path,title}] }
    for (const yearName of fs.readdirSync(root)) {
        const yearDir = path.join(root, yearName);
        if (!/^\d{4}$/.test(yearName) || !fs.statSync(yearDir).isDirectory()) continue;
        const year = parseInt(yearName, 10);
        for (const f of walk(yearDir)) {
            if (!/\.pdf$/i.test(f)) continue;
            const rel = path.relative(yearDir, f).split(path.sep);
            const week = (String(rel[0]).match(/(\d+)/) || [])[1];
            const fn = rel[rel.length - 1];
            const stag = rel.length >= 3 ? rel[1].trim() : (surnameFrom(fn) || '(non classé)');
            const key = `${year}|${week}|${stag}`;
            if (!groups.has(key)) groups.set(key, { year, week: week ? parseInt(week, 10) : null, stagiaire: stag, files: [] });
            groups.get(key).files.push({ path: f, title: fn.replace(/\.[^.]+$/, '') });
        }
    }

    let inserted = 0, skippedStag = 0, skippedExist = 0, keptStag = 0;
    for (const g of groups.values()) {
        if (g.files.length < 2) { skippedStag++; continue; }
        keptStag++;
        const formation = inferFormation(g.files.map((x) => x.title));
        for (const file of g.files) {
            const [[ex]] = await conn.query(
                'SELECT id FROM archive_document WHERE organization_id = ? AND year <=> ? AND week <=> ? AND learner_name = ? AND title = ? LIMIT 1',
                [orgId, g.year, g.week, g.stagiaire, file.title.slice(0, 255)]
            );
            if (ex) { skippedExist++; continue; }
            if (dryRun) { inserted++; continue; }
            const buf = fs.readFileSync(file.path);
            await conn.query(
                `INSERT INTO archive_document
                    (id, organization_id, year, week, formation_label, learner_name, title, status, mime, file)
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'ARCHIVE', 'application/pdf', ?)`,
                [orgId, g.year, g.week, formation, g.stagiaire, file.title.slice(0, 255), buf]
            );
            inserted++;
        }
    }

    console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}Stagiaires gardés : ${keptStag} · ignorés (<2 PDF) : ${skippedStag}`);
    console.log(`${dryRun ? 'À insérer' : 'Insérés'} : ${inserted} · déjà présents (sautés) : ${skippedExist}`);
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
