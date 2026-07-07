// Charge les modèles .docx fournis (src/api/templates) dans la table
// document_template pour un organisme donné. Équivalent « propre » d'un INSERT
// SQL de blobs binaires (qu'on évite : fichiers trop volumineux pour du SQL brut).
//
//   node src/api/scripts/seed-templates.js [organization_id]
//
// Sans argument : cible le premier organisme (le plus ancien). Idempotent
// (remplace le modèle existant pour chaque slug).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/database.js');
const { TEMPLATE_SLUGS } = require('../lib/docxfill.js');

const TPL_DIR = path.join(__dirname, '..', 'templates');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

(async () => {
    const conn = db.promise();
    try {
        let orgId = process.argv[2];
        if (!orgId) {
            const [[org]] = await conn.query('SELECT id FROM organization ORDER BY created_at LIMIT 1');
            if (!org) { console.error('Aucun organisme trouvé. Chargez seed.sql d\'abord.'); process.exit(1); }
            orgId = org.id;
        }
        console.log('Organisme :', orgId);

        let done = 0;
        for (const t of TEMPLATE_SLUGS) {
            const p = path.join(TPL_DIR, t.file);
            if (!fs.existsSync(p)) { console.warn('  ⚠ manquant :', t.file); continue; }
            const buf = fs.readFileSync(p);
            const [ex] = await conn.query('SELECT id FROM document_template WHERE organization_id = ? AND slug = ?', [orgId, t.slug]);
            if (ex.length) {
                await conn.query('UPDATE document_template SET file = ?, name = ?, mime = ? WHERE id = ?', [buf, t.file, MIME, ex[0].id]);
            } else {
                await conn.query('INSERT INTO document_template (id, organization_id, slug, name, mime, file) VALUES (?, ?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), orgId, t.slug, t.file, MIME, buf]);
            }
            console.log(`  ✓ ${t.slug} (${(buf.length / 1024 | 0)} Ko)`);
            done += 1;
        }
        console.log(`Terminé : ${done} modèle(s) chargé(s).`);
        process.exit(0);
    } catch (err) {
        console.error('Erreur :', err.message);
        if (/max_allowed_packet|packet/i.test(err.message || '')) {
            console.error('→ Augmentez max_allowed_packet côté MySQL (ex. SET GLOBAL max_allowed_packet = 33554432;).');
        }
        process.exit(1);
    }
})();
