#!/usr/bin/env node
/**
 * Import des stagiaires depuis l'export CSV de la « Fiche d'expression du stagiaire ».
 *
 * Crée / met à jour : stagiaires (learner), entreprises (company), sessions
 * (training_session), inscriptions (enrollment) et comptes de connexion (user).
 * Le n° de sécurité sociale est chiffré (même clé SSN_ENC_KEY que l'application).
 *
 * Ré-exécutable : entreprises/sessions/comptes dédupliqués ; stagiaires
 * dédupliqués par (email, nom, prénom, naissance) ; inscriptions par (stagiaire, session).
 *
 * Usage (depuis src/api) :
 *   node scripts/import-stagiaires.js "../../database/data/Data - Data.csv"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env') });
const { encrypt, generatePassword } = require('../lib/crypto.js');

const CSV_PATH = process.argv[2] || path.join(__dirname, '..', '..', 'database', 'data', 'Data - Data.csv');

// ---------------------------------------------------------------------------
// Parseur CSV (RFC 4180 : guillemets, virgules et sauts de ligne échappés).
// ---------------------------------------------------------------------------
function parseCSV(text) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = []; let row = []; let field = ''; let inQ = false; let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQ = false; i++; continue;
            }
            field += c; i++; continue;
        }
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// ---------------------------------------------------------------------------
// Helpers de mapping
// ---------------------------------------------------------------------------
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = (s) => { const v = (s || '').trim(); return v === '' ? null : v; };

// Nom de formation (verbeux) -> code programme.
function programCode(name) {
    const n = norm(name);
    if (!n) return null;
    if (n.includes('rs7404') || n.includes('fabriquer des pizzas artisanales')) return 'RS7404';
    if (n.includes('teglia') || n.includes('pala')) return 'TEGLIA';
    if (n.includes('napolitaine')) return 'NAPO';
    if (n.includes('expert')) return 'EXPERT';
    if (n.includes('contemporaine')) return 'NIV2C';
    if (n.includes('niveau ii') || n.includes('poolish')) return 'NIV2';
    if (n.includes('pro')) return 'NIV1PRO';
    if (n.includes('hygiene')) return 'NIV1H';
    if (n.includes('niveau i')) return 'NIV1';
    return null;
}

function frDateToISO(s) {
    const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function toNumber(s) {
    const v = parseFloat((s || '').replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isNaN(v) ? null : v;
}
function toInt(s) { const v = parseInt((s || '').replace(/[^\d]/g, ''), 10); return Number.isNaN(v) ? null : v; }
function civility(s) {
    const v = norm(s);
    if (v.startsWith('monsieur') || v === 'm' || v === 'm.') return 'M.';
    if (v.startsWith('madame') || v.startsWith('mme')) return 'Mme';
    return clean(s);
}
function financingOf(s) { return norm(s).startsWith('prof') ? 'PROFESSIONNEL' : 'PARTICULIER'; }
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function mondayISO(year, week) {
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const monday = new Date(simple);
    if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - dow + 1);
    else monday.setUTCDate(simple.getUTCDate() + 8 - dow);
    return fmt(monday);
}
function addBusinessDays(startISO, total) {
    const [y, m, d] = startISO.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    let c = 1;
    while (c < (total || 1)) { date.setDate(date.getDate() + 1); const w = date.getDay(); if (w !== 0 && w !== 6) c++; }
    return fmt(date);
}

// ---------------------------------------------------------------------------
async function main() {
    const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
    const header = rows[0];
    const H = {};
    header.forEach((h, i) => { (H[h.trim()] = H[h.trim()] || []).push(i); });
    const get = (row, name, occ = 0) => {
        const idx = (H[name] || [])[occ];
        return idx == null ? '' : (row[idx] || '').trim();
    };

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER_ADMIN,
        password: process.env.DB_PASSWORD_ADMIN,
        database: process.env.DB_NAME_ADMIN,
    });

    const [[org]] = [await conn.query('SELECT id FROM organization ORDER BY created_at LIMIT 1')];
    if (!org.length) { console.error('Aucune organisation. Lancez seed.sql d\'abord.'); process.exit(1); }
    const orgId = org[0].id;

    const [progs] = await conn.query('SELECT id, code, days FROM training_program WHERE organization_id = ?', [orgId]);
    const progByCode = Object.fromEntries(progs.map((p) => [p.code, p]));

    const userByEmail = {}; const companyByName = {}; const sessionByKey = {};
    const stats = { learners: 0, companies: 0, sessions: 0, enrollments: 0, users: 0, skipped: 0 };

    async function ensureUser(email, first, last, phone) {
        if (!email) return null;
        const key = email.toLowerCase();
        if (key in userByEmail) return userByEmail[key];
        const [ex] = await conn.query('SELECT id FROM user WHERE email = ?', [email]);
        if (ex.length) { userByEmail[key] = ex[0].id; return ex[0].id; }
        const id = crypto.randomUUID();
        const pw = generatePassword();
        const hash = await bcrypt.hash(pw, 10);
        await conn.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password, password_plain_enc)
             VALUES (?, ?, 'STAGIAIRE', ?, ?, ?, ?, ?, ?)`,
            [id, orgId, first, last, email, phone, hash, encrypt(pw)]
        );
        userByEmail[key] = id; stats.users++;
        return id;
    }

    async function ensureCompany(c) {
        if (!c.name) return null;
        const key = c.name.toLowerCase();
        if (key in companyByName) return companyByName[key];
        const [ex] = await conn.query('SELECT id FROM company WHERE organization_id = ? AND name = ?', [orgId, c.name]);
        if (ex.length) { companyByName[key] = ex[0].id; return ex[0].id; }
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO company (id, organization_id, name, legal_status, siret, naf_ape, address, zip_code, town,
                email, phone, opco, representative_civ, representative_name, representative_role)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, orgId, c.name, c.legal_status, c.siret, c.naf_ape, c.address, c.zip_code, c.town,
             c.email, c.phone, c.opco, c.representative_civ, c.representative_name, c.representative_role]
        );
        companyByName[key] = id; stats.companies++;
        return id;
    }

    async function ensureSession(code, year, week) {
        const p = progByCode[code];
        if (!p || !year || !week) return null;
        const key = `${p.id}|${year}|${week}`;
        if (key in sessionByKey) return sessionByKey[key];
        const [ex] = await conn.query(
            'SELECT id FROM training_session WHERE organization_id = ? AND program_id = ? AND year = ? AND week = ?',
            [orgId, p.id, year, week]);
        if (ex.length) { sessionByKey[key] = ex[0].id; return ex[0].id; }
        const id = crypto.randomUUID();
        const start = mondayISO(year, week);
        const end = addBusinessDays(start, p.days);
        await conn.query(
            `INSERT INTO training_session (id, organization_id, program_id, year, week, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PLANIFIEE')`,
            [id, orgId, p.id, year, week, start, end]);
        sessionByKey[key] = id; stats.sessions++;
        return id;
    }

    async function ensureEnrollment(learnerId, sessionId, companyId, financing) {
        if (!sessionId) return;
        try {
            await conn.query(
                `INSERT INTO enrollment (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
                 VALUES (?, ?, ?, ?, ?, ?, 'INSCRIT', 'ROUGE')`,
                [crypto.randomUUID(), orgId, learnerId, sessionId, companyId, financing]);
            stats.enrollments++;
        } catch (e) {
            if (e.code !== 'ER_DUP_ENTRY') throw e; // déjà inscrit à cette session
        }
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const last_name = clean(get(row, 'Nom'));
        const first_name = clean(get(row, 'Prénom'));
        if (!last_name && !first_name) { stats.skipped++; continue; }

        const email = clean(get(row, 'Adresse email'));
        const phone = clean(get(row, 'Téléphone'));
        const financing = financingOf(get(row, 'Devis personnel ou professionnel'));

        // Entreprise (devis professionnel).
        let companyId = null;
        if (financing === 'PROFESSIONNEL' && clean(get(row, "Nom de l'entreprise"))) {
            companyId = await ensureCompany({
                name: clean(get(row, "Nom de l'entreprise")),
                legal_status: clean(get(row, "Statut d'entreprise")),
                siret: clean(get(row, "SIRET de l'entreprise")),
                naf_ape: clean(get(row, 'Code NAF/APE', 0)),
                address: clean(get(row, "Adresse de l'entreprise")),
                zip_code: clean(get(row, "Code postal de l'entreprise")),
                town: clean(get(row, "Ville de l'entreprise")),
                email: clean(get(row, "Adresse email de l'entreprise")),
                phone: clean(get(row, "Téléphone de l'entreprise")),
                opco: clean(get(row, 'OPCO', 0)),
                representative_civ: civility(get(row, "Représentant de l'entreprise (Civilité)")),
                representative_name: clean(get(row, "Représentant de l'entreprise (Nom & Prénom)")),
                representative_role: clean(get(row, 'Fonction')),
            });
        }

        // Compte de connexion (dédupliqué par email).
        const userId = await ensureUser(email, first_name, last_name, phone);

        // Stagiaire (dédup par email/nom/prénom/naissance).
        const birthday = frDateToISO(get(row, 'Date de naissance'));
        const [dup] = await conn.query(
            `SELECT id FROM learner WHERE organization_id = ?
               AND last_name <=> ? AND first_name <=> ? AND (email <=> ? OR (email IS NULL AND ? IS NULL))
               AND (birthday <=> ?) LIMIT 1`,
            [orgId, last_name, first_name, email, email, birthday]);
        let learnerId;
        if (dup.length) {
            learnerId = dup[0].id;
        } else {
            learnerId = crypto.randomUUID();
            const ssn = clean(get(row, 'Numéro de sécurité sociale'));
            await conn.query(
                `INSERT INTO learner (id, organization_id, company_id, user_id,
                    contacted_at, contacted_by, civility, first_name, last_name, email, phone, birthday, birth_place,
                    address, zip_code, town, diploma_level, diploma_name, diploma_year, last_experience,
                    experience_value, experience_unit, professional_status, cpf_amount, france_travail_id,
                    current_contract, social_security, financing,
                    project_creation, project_takeover, project_oven, project_truck, project_job)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [learnerId, orgId, companyId, userId,
                 frDateToISO(get(row, 'Contact le')), clean(get(row, 'Contacté par')), civility(get(row, 'Civilité')),
                 first_name, last_name, email, phone, birthday, clean(get(row, 'Lieu de naissance')),
                 clean(get(row, 'Adresse')), clean(get(row, 'Code postal')), clean(get(row, 'Ville')),
                 clean(get(row, 'Niveau du diplôme le plus élevé')), clean(get(row, 'Nom du diplôme le plus élevé')),
                 clean(get(row, "Année d'obtention du diplôme le plus élevé")), clean(get(row, 'Dernière expérience professionnelle')),
                 clean(get(row, 'Combien de temps (chiffre ou nombre)')), clean(get(row, 'Combien de temps (mois ou année)')),
                 clean(get(row, 'Êtes-vous ?')), toNumber(get(row, 'Combien de CPF')), clean(get(row, 'Id pôle emploi')),
                 clean(get(row, 'Votre contrat actuel')), ssn ? encrypt(ssn) : null, financing,
                 get(row, 'Création ?') ? 1 : 0, get(row, 'Reprise ?') ? 1 : 0, get(row, 'Four ?') ? 1 : 0,
                 get(row, 'Camion / Remorque') ? 1 : 0, get(row, 'Cherche poste pizzaïolo(la)') ? 1 : 0]);
            stats.learners++;
        }

        // Inscriptions (1re et éventuelle 2e formation).
        const s1 = await ensureSession(programCode(get(row, 'Niveau suggérer')),
            toInt(get(row, 'Année de la formation')), toInt(get(row, 'Semaine de la formation')));
        await ensureEnrollment(learnerId, s1, companyId, financing);

        const s2 = await ensureSession(programCode(get(row, 'Niveau suggérer (2)')),
            toInt(get(row, 'Année de la formation (2)')), toInt(get(row, 'Semaine de la formation (2)')));
        await ensureEnrollment(learnerId, s2, companyId, financing);
    }

    await conn.end();
    console.log('Import terminé :', JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
