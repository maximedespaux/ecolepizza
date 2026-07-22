// Maîtrise sanitaire (HACCP) — journal PMS de l'espace stagiaire.
// Trois surfaces : le référentiel des points de contrôle (hs_equipment), le plan de nettoyage
// (hs_cleaning_task) et le journal universel (hs_entry). Tout est scellé par stagiaire (user_id)
// ET organisme (organization_id), comme la mercuriale.
//
// Dégradation gracieuse : tant que la migration 103 n'est pas jouée, les lectures renvoient une
// liste vide + { migration: true } (l'UI affiche « à venir » au lieu de planter) et les écritures
// renvoient 503 explicite. Aucun 500 opaque.
const crypto = require('crypto');
const db = require('../config/database.js');

const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

const REGISTERS = ['TEMPERATURE', 'REFROIDISSEMENT', 'REMISE_TEMP', 'RECEPTION', 'CLEANING', 'LABEL', 'OIL', 'NONCONF', 'BIOWASTE', 'EQUIPMENT', 'AUDIT'];
const EQUIP_TYPES = ['FROID', 'CONGELATEUR', 'CHAUD', 'FOUR', 'PETRIN', 'FRITEUSE', 'AUTRE'];
const FREQUENCIES = ['QUOTIDIEN', 'HEBDO', 'MENSUEL', 'TRIMESTRIEL', 'APRES_USAGE'];
const STATUSES = ['CONFORME', 'NON_CONFORME', 'A_VERIFIER', 'FAIT', 'OUVERT', 'RESOLU', 'NA'];

const str = (v, max) => { const s = (v == null ? '' : String(v)).trim(); return s ? s.slice(0, max) : null; };
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const oneOf = (v, allowed) => (allowed.includes(String(v)) ? String(v) : null);
const bool = (v) => (v ? 1 : 0);

// ISO/quelconque → 'YYYY-MM-DD HH:MM:SS' (format datetime MariaDB). NULL si invalide.
const toDT = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' '); };
const nowDT = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const parseMeta = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return {}; } };

// ─── Référentiel équipement ───────────────────────────────────────────────────────────────────
const EQUIP_SEL = `SELECT id, organization_id, user_id, name, type, target_min, target_max, unit,
  location, note, active, sort_order, created_at, updated_at FROM hs_equipment`;

const listEquipment = async (req, res) => {
    try {
        const conn = db.promise();
        const all = req.query.all === '1';
        const [rows] = await conn.query(
            `${EQUIP_SEL} WHERE user_id = ? ${all ? '' : 'AND active = 1'} ORDER BY sort_order, name`,
            [req.user.id]);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [], migration: true });
        console.error('Erreur liste équipements hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const createEquipment = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const name = str(b.name, 160);
        if (!name) return res.status(400).json({ message: 'Nom requis.' });
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO hs_equipment (id, organization_id, user_id, name, type, target_min, target_max, unit, location, note, active, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, req.user.organization_id, req.user.id, name, oneOf(b.type, EQUIP_TYPES) || 'FROID',
             numOrNull(b.target_min), numOrNull(b.target_max), str(b.unit, 16) || '°C',
             str(b.location, 160), str(b.note, 500), bool(b.active == null ? 1 : b.active), Number(b.sort_order) || 0]);
        const [[row]] = await conn.query(`${EQUIP_SEL} WHERE id = ?`, [id]);
        res.status(201).json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur création équipement hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const EQUIP_FIELDS = {
    name: (v) => ['name', str(v, 160)],
    type: (v) => ['type', oneOf(v, EQUIP_TYPES) || 'FROID'],
    target_min: (v) => ['target_min', numOrNull(v)],
    target_max: (v) => ['target_max', numOrNull(v)],
    unit: (v) => ['unit', str(v, 16) || '°C'],
    location: (v) => ['location', str(v, 160)],
    note: (v) => ['note', str(v, 500)],
    active: (v) => ['active', bool(v)],
    sort_order: (v) => ['sort_order', Number(v) || 0],
};

const updateEquipment = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const sets = [], params = [];
        for (const [k, fn] of Object.entries(EQUIP_FIELDS)) {
            if (b[k] === undefined) continue;
            const [col, val] = fn(b[k]);
            if (k === 'name' && !val) return res.status(400).json({ message: 'Nom requis.' });
            sets.push(`${col} = ?`); params.push(val);
        }
        if (!sets.length) return res.status(400).json({ message: 'Rien à modifier.' });
        params.push(req.params.id, req.user.id);
        const [r] = await conn.query(`UPDATE hs_equipment SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
        if (!r.affectedRows) return res.status(404).json({ message: 'Équipement introuvable.' });
        const [[row]] = await conn.query(`${EQUIP_SEL} WHERE id = ?`, [req.params.id]);
        res.json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur maj équipement hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const deleteEquipment = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM hs_equipment WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Équipement introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur suppression équipement hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ─── Plan de nettoyage ────────────────────────────────────────────────────────────────────────
const TASK_SEL = `SELECT id, organization_id, user_id, zone, task, frequency, product, method,
  active, sort_order, created_at, updated_at FROM hs_cleaning_task`;

const listTasks = async (req, res) => {
    try {
        const conn = db.promise();
        const all = req.query.all === '1';
        const [rows] = await conn.query(
            `${TASK_SEL} WHERE user_id = ? ${all ? '' : 'AND active = 1'} ORDER BY sort_order, zone, task`,
            [req.user.id]);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [], migration: true });
        console.error('Erreur liste plan nettoyage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const createTask = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const zone = str(b.zone, 120), task = str(b.task, 255);
        if (!zone || !task) return res.status(400).json({ message: 'Zone et tâche requises.' });
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO hs_cleaning_task (id, organization_id, user_id, zone, task, frequency, product, method, active, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [id, req.user.organization_id, req.user.id, zone, task, oneOf(b.frequency, FREQUENCIES) || 'QUOTIDIEN',
             str(b.product, 160), str(b.method, 500), bool(b.active == null ? 1 : b.active), Number(b.sort_order) || 0]);
        const [[row]] = await conn.query(`${TASK_SEL} WHERE id = ?`, [id]);
        res.status(201).json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur création tâche nettoyage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const TASK_FIELDS = {
    zone: (v) => ['zone', str(v, 120)],
    task: (v) => ['task', str(v, 255)],
    frequency: (v) => ['frequency', oneOf(v, FREQUENCIES) || 'QUOTIDIEN'],
    product: (v) => ['product', str(v, 160)],
    method: (v) => ['method', str(v, 500)],
    active: (v) => ['active', bool(v)],
    sort_order: (v) => ['sort_order', Number(v) || 0],
};

const updateTask = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const sets = [], params = [];
        for (const [k, fn] of Object.entries(TASK_FIELDS)) {
            if (b[k] === undefined) continue;
            const [col, val] = fn(b[k]);
            if ((k === 'zone' || k === 'task') && !val) return res.status(400).json({ message: 'Zone et tâche requises.' });
            sets.push(`${col} = ?`); params.push(val);
        }
        if (!sets.length) return res.status(400).json({ message: 'Rien à modifier.' });
        params.push(req.params.id, req.user.id);
        const [r] = await conn.query(`UPDATE hs_cleaning_task SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
        if (!r.affectedRows) return res.status(404).json({ message: 'Tâche introuvable.' });
        const [[row]] = await conn.query(`${TASK_SEL} WHERE id = ?`, [req.params.id]);
        res.json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur maj tâche nettoyage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const deleteTask = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM hs_cleaning_task WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Tâche introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur suppression tâche nettoyage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ─── Préréglages (fournisseurs / produits fréquents) ─────────────────────────────────────────
const PRESET_KINDS = ['SUPPLIER', 'PRODUCT'];
const PRESET_SEL = `SELECT id, organization_id, user_id, kind, label, dlc_days, meta, sort_order, active,
  created_at, updated_at FROM hs_preset`;
const mapPreset = (row) => ({ ...row, meta: parseMeta(row.meta) });

const listPresets = async (req, res) => {
    try {
        const conn = db.promise();
        const kind = oneOf(req.query.kind, PRESET_KINDS);
        const where = ['user_id = ?']; const params = [req.user.id];
        if (kind) { where.push('kind = ?'); params.push(kind); }
        if (req.query.all !== '1') where.push('active = 1');
        const [rows] = await conn.query(`${PRESET_SEL} WHERE ${where.join(' AND ')} ORDER BY kind, sort_order, label`, params);
        res.json({ data: rows.map(mapPreset) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [], migration: true });
        console.error('Erreur liste préréglages :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const createPreset = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const kind = oneOf(b.kind, PRESET_KINDS);
        const label = str(b.label, 160);
        if (!kind) return res.status(400).json({ message: 'Type de préréglage invalide.' });
        if (!label) return res.status(400).json({ message: 'Libellé requis.' });
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO hs_preset (id, organization_id, user_id, kind, label, dlc_days, meta, sort_order, active)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [id, req.user.organization_id, req.user.id, kind, label,
             b.dlc_days === '' || b.dlc_days == null ? null : Number(b.dlc_days),
             JSON.stringify(b.meta || {}), Number(b.sort_order) || 0, bool(b.active == null ? 1 : b.active)]);
        const [[row]] = await conn.query(`${PRESET_SEL} WHERE id = ?`, [id]);
        res.status(201).json({ data: mapPreset(row) });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur création préréglage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const PRESET_FIELDS = {
    label: (v) => ['label', str(v, 160)],
    dlc_days: (v) => ['dlc_days', v === '' || v == null ? null : Number(v)],
    meta: (v) => ['meta', JSON.stringify(v || {})],
    sort_order: (v) => ['sort_order', Number(v) || 0],
    active: (v) => ['active', bool(v)],
};

const updatePreset = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const sets = [], params = [];
        for (const [k, fn] of Object.entries(PRESET_FIELDS)) {
            if (b[k] === undefined) continue;
            const [col, val] = fn(b[k]);
            if (k === 'label' && !val) return res.status(400).json({ message: 'Libellé requis.' });
            sets.push(`${col} = ?`); params.push(val);
        }
        if (!sets.length) return res.status(400).json({ message: 'Rien à modifier.' });
        params.push(req.params.id, req.user.id);
        const [r] = await conn.query(`UPDATE hs_preset SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
        if (!r.affectedRows) return res.status(404).json({ message: 'Préréglage introuvable.' });
        const [[row]] = await conn.query(`${PRESET_SEL} WHERE id = ?`, [req.params.id]);
        res.json({ data: mapPreset(row) });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur maj préréglage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const deletePreset = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM hs_preset WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Préréglage introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur suppression préréglage :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ─── Journal universel ────────────────────────────────────────────────────────────────────────
// On joint le nom de l'équipement et le libellé de la tâche pour que le front affiche sans
// rappel d'API. `meta` est reparsé en objet à la sortie.
const ENTRY_SEL = `SELECT e.id, e.register, e.equipment_id, e.task_id, e.title, e.value_num, e.unit,
  e.status, e.occurred_at, e.due_at, e.note, e.corrective, e.meta, e.created_at,
  eq.name AS equipment_name, eq.type AS equipment_type, eq.target_min, eq.target_max,
  t.zone AS task_zone, t.task AS task_label
  FROM hs_entry e
  LEFT JOIN hs_equipment eq ON eq.id = e.equipment_id
  LEFT JOIN hs_cleaning_task t ON t.id = e.task_id`;

const mapEntry = (row) => ({ ...row, meta: parseMeta(row.meta) });

const listEntries = async (req, res) => {
    try {
        const conn = db.promise();
        const where = ['e.user_id = ?'];
        const params = [req.user.id];
        const reg = oneOf(req.query.register, REGISTERS);
        if (reg) { where.push('e.register = ?'); params.push(reg); }
        const from = toDT(req.query.from);
        if (from) { where.push('e.occurred_at >= ?'); params.push(from); }
        const to = toDT(req.query.to);
        if (to) { where.push('e.occurred_at <= ?'); params.push(to); }
        const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
        const [rows] = await conn.query(
            `${ENTRY_SEL} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT ${limit}`, params);
        res.json({ data: rows.map(mapEntry) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [], migration: true });
        console.error('Erreur liste journal hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const createEntry = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const register = oneOf(b.register, REGISTERS);
        if (!register) return res.status(400).json({ message: 'Registre invalide.' });
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO hs_entry (id, organization_id, user_id, register, equipment_id, task_id, title, value_num, unit, status, occurred_at, due_at, note, corrective, meta)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, req.user.organization_id, req.user.id, register,
             b.equipment_id || null, b.task_id || null, str(b.title, 255), numOrNull(b.value_num), str(b.unit, 16),
             oneOf(b.status, STATUSES), toDT(b.occurred_at) || nowDT(), toDT(b.due_at),
             str(b.note, 1000), str(b.corrective, 1000), JSON.stringify(b.meta || {})]);
        const [[row]] = await conn.query(`${ENTRY_SEL} WHERE e.id = ?`, [id]);
        res.status(201).json({ data: mapEntry(row) });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur création entrée hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const ENTRY_FIELDS = {
    equipment_id: (v) => ['equipment_id', v || null],
    task_id: (v) => ['task_id', v || null],
    title: (v) => ['title', str(v, 255)],
    value_num: (v) => ['value_num', numOrNull(v)],
    unit: (v) => ['unit', str(v, 16)],
    status: (v) => ['status', oneOf(v, STATUSES)],
    occurred_at: (v) => ['occurred_at', toDT(v) || nowDT()],
    due_at: (v) => ['due_at', toDT(v)],
    note: (v) => ['note', str(v, 1000)],
    corrective: (v) => ['corrective', str(v, 1000)],
    meta: (v) => ['meta', JSON.stringify(v || {})],
};

const updateEntry = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const sets = [], params = [];
        for (const [k, fn] of Object.entries(ENTRY_FIELDS)) {
            if (b[k] === undefined) continue;
            const [col, val] = fn(b[k]);
            sets.push(`${col} = ?`); params.push(val);
        }
        if (!sets.length) return res.status(400).json({ message: 'Rien à modifier.' });
        params.push(req.params.id, req.user.id);
        const [r] = await conn.query(`UPDATE hs_entry SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
        if (!r.affectedRows) return res.status(404).json({ message: 'Entrée introuvable.' });
        const [[row]] = await conn.query(`${ENTRY_SEL} WHERE e.id = ?`, [req.params.id]);
        res.json({ data: mapEntry(row) });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur maj entrée hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const deleteEntry = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM hs_entry WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Entrée introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table hygiène absente — migration 103 à appliquer.', migration: true });
        console.error('Erreur suppression entrée hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ─── Tableau de bord du hub — le « système d'attente » ────────────────────────────────────────
// Par registre : total, date de la dernière, et FAIT AUJOURD'HUI. Pour les registres planifiés
// (température, nettoyage) on calcule en plus ATTENDU / EN ATTENTE du jour :
//   · Température : un relevé par équipement froid/chaud actif ; en attente = équipements pas
//     encore relevés aujourd'hui.
//   · Nettoyage : les tâches quotidiennes / après-usage ; en attente = pas encore cochées ce jour.
// Le front décide « en retard » en comparant l'heure courante à l'échéance du registre. Plus les
// deux alertes transversales : DLC dans les 3 jours et non-conformités ouvertes.
const getSummary = async (req, res) => {
    try {
        const conn = db.promise();
        const uid = req.user.id;
        const [byReg] = await conn.query(
            `SELECT register, COUNT(*) AS n, MAX(occurred_at) AS last_at,
                    SUM(occurred_at >= CURDATE()) AS today
             FROM hs_entry WHERE user_id = ? GROUP BY register`, [uid]);

        // Température : équipements froids/chauds actifs vs relevés distincts du jour.
        const [[tEquip]] = await conn.query(
            `SELECT COUNT(*) AS n FROM hs_equipment
             WHERE user_id = ? AND active = 1 AND type IN ('FROID','CONGELATEUR','CHAUD')`, [uid]);
        const [[tRead]] = await conn.query(
            `SELECT COUNT(DISTINCT equipment_id) AS n FROM hs_entry
             WHERE user_id = ? AND register = 'TEMPERATURE' AND equipment_id IS NOT NULL
               AND occurred_at >= CURDATE()`, [uid]);

        // Nettoyage : tâches du jour (quotidiennes / après-usage) vs tâches distinctes cochées ce jour.
        const [[cTasks]] = await conn.query(
            `SELECT COUNT(*) AS n FROM hs_cleaning_task
             WHERE user_id = ? AND active = 1 AND frequency IN ('QUOTIDIEN','APRES_USAGE')`, [uid]);
        const [[cDone]] = await conn.query(
            `SELECT COUNT(DISTINCT task_id) AS n FROM hs_entry
             WHERE user_id = ? AND register = 'CLEANING' AND task_id IS NOT NULL
               AND occurred_at >= CURDATE()`, [uid]);

        const [[dueSoon]] = await conn.query(
            `SELECT COUNT(*) AS n FROM hs_entry
             WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= (NOW() + INTERVAL 3 DAY)
               AND (status IS NULL OR status <> 'RESOLU')`, [uid]);
        const [[openNc]] = await conn.query(
            `SELECT COUNT(*) AS n FROM hs_entry
             WHERE user_id = ? AND register = 'NONCONF' AND status = 'OUVERT'`, [uid]);
        const [[equip]] = await conn.query('SELECT COUNT(*) AS n FROM hs_equipment WHERE user_id = ? AND active = 1', [uid]);
        const [[tasks]] = await conn.query('SELECT COUNT(*) AS n FROM hs_cleaning_task WHERE user_id = ? AND active = 1', [uid]);

        const byRegister = {};
        for (const r of byReg) byRegister[r.register] = { n: r.n, last_at: r.last_at, today: Number(r.today) || 0 };
        const bump = (reg, patch) => { byRegister[reg] = { n: 0, last_at: null, today: 0, ...byRegister[reg], ...patch }; };
        bump('TEMPERATURE', { expected: tEquip.n, pending: Math.max(0, tEquip.n - tRead.n) });
        bump('CLEANING', { expected: cTasks.n, pending: Math.max(0, cTasks.n - cDone.n) });

        res.json({ data: { byRegister, dueSoon: dueSoon.n, openNonConf: openNc.n, equipment: equip.n, tasks: tasks.n } });
    } catch (err) {
        if (noTable(err)) return res.json({ data: { byRegister: {}, dueSoon: 0, openNonConf: 0, equipment: 0, tasks: 0 }, migration: true });
        console.error('Erreur résumé hygiène :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    listEquipment, createEquipment, updateEquipment, deleteEquipment,
    listTasks, createTask, updateTask, deleteTask,
    listPresets, createPreset, updatePreset, deletePreset,
    listEntries, createEntry, updateEntry, deleteEntry,
    getSummary,
};
