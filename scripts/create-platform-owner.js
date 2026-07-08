#!/usr/bin/env node
/**
 * Crée un compte « propriétaire de plateforme » (PLATFORM_OWNER, sans organisme).
 * Ce compte peut ensuite créer des organismes + leur premier administrateur
 * depuis l'application (revente).
 *
 * Usage :
 *   node scripts/create-platform-owner.js <email> [mot_de_passe]
 *
 * À la connexion, laissez le champ « Code organisme » VIDE.
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'api', 'config', 'database.js'));

async function main() {
    const email = (process.argv[2] || '').trim();
    const password = process.argv[3] || crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
    if (!email) {
        console.error('Usage : node scripts/create-platform-owner.js <email> [mot_de_passe]');
        process.exit(1);
    }
    const conn = db.promise();
    const [exists] = await conn.query(
        "SELECT id FROM user WHERE email = ? AND organization_id IS NULL",
        [email]
    );
    if (exists.length) {
        console.error('Un propriétaire de plateforme existe déjà avec cet e-mail.');
        process.exit(1);
    }
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await conn.query(
        "INSERT INTO user (id, organization_id, role, email, password, active) VALUES (?, NULL, 'PLATFORM_OWNER', ?, ?, 1)",
        [id, email, hash]
    );
    console.log('✓ Propriétaire de plateforme créé.');
    console.log('  Email       :', email);
    console.log('  Mot de passe:', password);
    console.log('  Connexion   : laissez le « Code organisme » vide.');
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
