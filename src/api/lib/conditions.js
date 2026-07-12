// Conditions personnalisées : filtres « ce document ne s'applique que si … » définis
// par l'organisme, basés sur des CHAMPS RÉELS du dossier. Les champs disponibles sont
// découverts dynamiquement dans le schéma (tables liées à un dossier) et activés/
// désactivés par l'organisme (éditeur de document → « Champs documents »). Le moteur du parcours
// évalue ces conditions en plus des conditions intégrées (financement, RS, hygiène…).
const { parseApplies } = require('./documents.js');

// Tables réellement rattachées à UN dossier (inscription). Alias SQL utilisés par
// loadDossierFactsMap (jointures depuis enrollment).
const ELIGIBLE_TABLES = ['learner', 'enrollment', 'training_program', 'training_session', 'company', 'organization'];
const TABLE_ALIAS = { learner: 'l', enrollment: 'e', training_program: 'p', training_session: 's', company: 'co', organization: 'o' };
const TABLE_LABEL = {
    learner: 'Stagiaire', enrollment: 'Inscription', training_program: 'Formation',
    training_session: 'Session', company: 'Entreprise', organization: 'Organisme',
};

// Colonnes techniques / sensibles exclues d'office (jamais proposées comme condition).
const EXCLUDED_EXACT = new Set([
    'id', 'password', 'social_security', 'lat', 'lng', 'geo_precision', 'geocoded_at',
    'created_at', 'updated_at', 'sort_order', 'color', 'signature_image', 'sign_cert',
]);
function isExcludedColumn(name) {
    if (EXCLUDED_EXACT.has(name)) return true;
    if (name.endsWith('_id')) return true;      // clés étrangères / uuid
    if (name.endsWith('_enc')) return true;      // colonnes chiffrées
    if (/token|secret|password/.test(name)) return true;
    return false;
}

// Champs « virtuels » calculés (pas une colonne directe).
const VIRTUALS = [
    { key: 'virtual.age', table: 'virtual', column: 'age', label: 'Âge du stagiaire', type: 'number' },
    { key: 'virtual.has_company', table: 'virtual', column: 'has_company', label: 'Rattaché à une entreprise', type: 'bool' },
];

// Champs SPÉCIAUX (non introspectés). La signature de l'organisme est une image (jeton),
// pas une colonne conditionnable — type 'image'. Gérée dans « Champs documents » (Organisme).
const SPECIAL_FIELDS = [
    { key: 'organization.signature_image', table: 'organization', column: 'signature_image', type: 'image', label: "Signature de l'organisme" },
];

// Activés par défaut (tant que l'organisme n'a rien personnalisé) — comportement utile d'emblée.
const DEFAULT_ENABLED = new Set([
    'learner.opco', 'learner.professional_status', 'learner.diploma_level', 'learner.current_contract',
    'learner.cpf_amount', 'learner.project_creation', 'learner.project_takeover', 'learner.project_oven',
    'learner.project_truck', 'learner.project_job',
    'enrollment.financing', 'enrollment.crm_stage', 'enrollment.price',
    'training_program.days', 'training_program.level', 'training_program.code',
    'training_program.rs_code', 'training_program.hygiene',
    'organization.legal_name', 'organization.short_name', 'organization.manager',
    'organization.siret', 'organization.vat_number', 'organization.nda', 'organization.naf_ape',
    'organization.address', 'organization.zip_code', 'organization.town',
    'organization.phone', 'organization.email', 'organization.signature_image',
    'virtual.age', 'virtual.has_company',
]);

// Opérateurs disponibles selon le type de champ.
const OPERATORS = {
    text: [
        { value: 'eq', label: 'est' }, { value: 'ne', label: "n'est pas" },
        { value: 'in', label: 'parmi' }, { value: 'contains', label: 'contient' },
    ],
    enum: [{ value: 'eq', label: 'est' }, { value: 'ne', label: "n'est pas" }, { value: 'in', label: 'parmi' }],
    number: [
        { value: 'eq', label: '=' }, { value: 'ne', label: '≠' },
        { value: 'lt', label: '<' }, { value: 'le', label: '≤' },
        { value: 'gt', label: '>' }, { value: 'ge', label: '≥' }, { value: 'in', label: 'parmi' },
    ],
    bool: [{ value: 'is_true', label: 'Oui' }, { value: 'is_false', label: 'Non' }],
    image: [], // image (signature) : jeton uniquement, non conditionnable
};
const OPS_ALL = new Set(Object.values(OPERATORS).flat().map((o) => o.value));

// Mappe un type SQL -> type de condition (ou null si non pris en charge : dates, etc.).
function sqlToType(dataType, columnType) {
    if (columnType === 'tinyint(1)') return 'bool';
    if (dataType === 'enum') return 'enum';
    if (['int', 'bigint', 'smallint', 'mediumint', 'tinyint', 'decimal', 'float', 'double'].includes(dataType)) return 'number';
    if (['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'].includes(dataType)) return 'text';
    return null; // date/datetime/timestamp/blob… : non proposés (v1)
}
function parseEnumOptions(columnType) {
    const m = /^enum\((.*)\)$/i.exec(columnType || '');
    if (!m) return [];
    return m[1].split(',').map((s) => s.trim().replace(/^'(.*)'$/, '$1')).map((v) => ({ value: v, label: v }));
}
const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const cleanComment = (c) => String(c || '').replace(/[«»"]/g, '').trim().slice(0, 120);

// Libellés français par défaut (les colonnes sont nommées en anglais). Clé =
// « table.colonne » (prioritaire) ou « colonne » (générique, partagée entre tables).
const FR_LABELS = {
    // Stagiaire
    contacted_by: 'Contacté par', civility: 'Civilité', first_name: 'Prénom', last_name: 'Nom',
    email: 'E-mail', phone: 'Téléphone', birth_place: 'Lieu de naissance', address: 'Adresse',
    zip_code: 'Code postal', town: 'Ville', diploma_level: 'Niveau de diplôme', diploma_name: 'Nom du diplôme',
    diploma_year: 'Année du diplôme', last_experience: 'Dernière expérience', experience_value: "Durée d'expérience",
    experience_unit: "Unité d'expérience", professional_status: 'Statut professionnel', levels: 'Niveaux / accès',
    cpf_amount: 'Montant CPF', current_contract: 'Contrat actuel', financing: 'Financement', opco: 'OPCO / financeur',
    project_creation: 'Projet : création', project_takeover: 'Projet : reprise', project_oven: 'Projet : four',
    project_truck: 'Projet : camion / remorque', project_job: 'Projet : recherche de poste',
    // Inscription
    price: 'Prix', acompte: 'Acompte', crm_stage: 'Étape CRM', conformite_score: 'Score de conformité',
    // Formation
    'training_program.code': 'Code formation', 'training_program.level': 'Niveau de formation',
    'training_program.title': 'Intitulé de la formation', 'training_program.price': 'Prix catalogue',
    days: 'Durée (jours)', hours: 'Durée (heures)', audience: 'Public', objectives: 'Objectifs',
    objective_general: 'Objectif général', duration_detail: 'Détail de durée', program_detail: 'Déroulé du programme',
    rs_code: 'Code RS (certifiante)', hygiene: 'Formation hygiène', active: 'Active',
    // Session
    year: 'Année', week: 'Semaine', trainer: 'Formateur', status: 'Statut',
    // Entreprise
    'company.name': "Nom de l'entreprise", 'company.legal_name': 'Raison sociale', siret: 'SIRET',
    vat_number: 'N° TVA', naf_ape: 'Code NAF/APE',
};
const frLabel = (table, column) => FR_LABELS[`${table}.${column}`] || FR_LABELS[column] || null;

// Introspecte les colonnes éligibles des tables « dossier ». -> [{table,column,type,options,label}]
async function introspectFields(conn) {
    const [rows] = await conn.query(
        `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt, COLUMN_TYPE AS ct, COLUMN_COMMENT AS cm
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
        [ELIGIBLE_TABLES]
    );
    const out = [];
    for (const r of rows) {
        if (isExcludedColumn(r.c)) continue;
        const type = sqlToType(r.dt, r.ct);
        if (!type) continue;
        out.push({
            table: r.t, column: r.c, type,
            options: type === 'enum' ? parseEnumOptions(r.ct) : undefined,
            // Libellé FR prioritaire ; sinon commentaire de colonne ; sinon nom humanisé.
            label: frLabel(r.t, r.c) || cleanComment(r.cm) || `${TABLE_LABEL[r.t] || r.t} · ${humanize(r.c)}`,
        });
    }
    return out;
}

// État d'activation + libellés personnalisés (table condition_field). Tolère l'absence de table.
async function loadFieldSettings(conn, orgId) {
    const m = new Map();
    try {
        const [rows] = await conn.query(
            'SELECT source_table, column_name, enabled, label FROM condition_field WHERE organization_id = ?',
            [orgId]
        );
        for (const r of rows) m.set(`${r.source_table}.${r.column_name}`, { enabled: !!r.enabled, label: r.label || null });
    } catch (e) {
        if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e;
    }
    return m;
}

// Catalogue COMPLET (activés + désactivés) pour la page de réglages, groupé logiquement.
async function getAllFields(conn, orgId) {
    const settings = await loadFieldSettings(conn, orgId);
    const cols = [...VIRTUALS.map((v) => ({ ...v })), ...SPECIAL_FIELDS.map((v) => ({ ...v })), ...await introspectFields(conn)];
    return cols.map((f) => {
        const key = `${f.table}.${f.column}`;
        const s = settings.get(key);
        return {
            key, table: f.table, tableLabel: TABLE_LABEL[f.table] || (f.table === 'virtual' ? 'Calculé' : f.table),
            column: f.column, type: f.type, options: f.options,
            label: (s && s.label) || f.label,
            enabled: s ? s.enabled : DEFAULT_ENABLED.has(key),
        };
    });
}

// Catalogue ACTIVÉ (pour le sélecteur de conditions et l'évaluation).
async function getEnabledFields(conn, orgId) {
    return (await getAllFields(conn, orgId)).filter((f) => f.enabled);
}

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
const truthy = (v) => !!v && v !== '0' && v !== 0 && norm(v) !== 'false';

function computeAge(birthday) {
    if (!birthday) return null;
    const d = new Date(birthday);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
}

// Charge les faits (valeurs des champs activés) pour un lot de dossiers -> Map eid => facts.
// SQL dynamique : les noms de colonnes proviennent EXCLUSIVEMENT de l'introspection
// (liste blanche), jamais d'une saisie utilisateur.
async function loadDossierFactsMap(conn, orgId, enrollmentIds, catalog) {
    const map = new Map();
    if (!enrollmentIds || !enrollmentIds.length) return map;
    const real = catalog.filter((f) => f.table !== 'virtual' && f.type !== 'image' && /^[a-z0-9_]+$/.test(f.column) && TABLE_ALIAS[f.table]);
    const needAge = catalog.some((f) => f.key === 'virtual.age');
    const needCompany = catalog.some((f) => f.key === 'virtual.has_company');

    const selects = real.map((f, i) => `${TABLE_ALIAS[f.table]}.\`${f.column}\` AS c${i}`);
    if (needAge) selects.push('l.birthday AS __birthday');
    if (needCompany) selects.push('e.company_id AS __company_id');

    const [rows] = await conn.query(
        `SELECT e.id AS __eid${selects.length ? ', ' + selects.join(', ') : ''}
         FROM enrollment e
         LEFT JOIN learner l ON l.id = e.learner_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         LEFT JOIN company co ON co.id = e.company_id
         LEFT JOIN organization o ON o.id = e.organization_id
         WHERE e.organization_id = ? AND e.id IN (?)`,
        [orgId, enrollmentIds]
    );
    for (const r of rows) {
        const facts = {};
        real.forEach((f, i) => {
            const raw = r[`c${i}`];
            facts[f.key] = f.type === 'bool' ? truthy(raw)
                : f.type === 'number' ? (raw == null ? null : Number(raw))
                    : (raw == null ? null : String(raw));
        });
        if (needAge) facts['virtual.age'] = computeAge(r.__birthday);
        if (needCompany) facts['virtual.has_company'] = !!r.__company_id;
        map.set(r.__eid, facts);
    }
    return map;
}

// Évalue UNE condition contre les faits du dossier.
function evalCondition(cond, facts = {}) {
    if (!cond) return true;
    const v = facts[cond.field];
    const val = cond.value;
    switch (cond.op) {
        case 'eq': return norm(v) === norm(val);
        case 'ne': return norm(v) !== norm(val);
        case 'in': return Array.isArray(val) ? val.map(norm).includes(norm(v)) : norm(v) === norm(val);
        case 'contains': return norm(v).includes(norm(val));
        case 'lt': return Number(v) < Number(val);
        case 'le': return Number(v) <= Number(val);
        case 'gt': return Number(v) > Number(val);
        case 'ge': return Number(v) >= Number(val);
        case 'is_true': return truthy(v);
        case 'is_false': return !truthy(v);
        default: return true;
    }
}

// Toutes les conditions référencées (applies_when.conditions) doivent être vraies.
function matchCustom(applies, facts, condById) {
    if (!condById || !condById.size) return true;
    const a = parseApplies(applies);
    const keys = Array.isArray(a.conditions) ? a.conditions : [];
    for (const k of keys) {
        const cond = condById.get(k);
        if (cond && !evalCondition(cond, facts)) return false;
    }
    return true;
}

// Valide/normalise une condition d'après le catalogue activé.
function validateCondition(catalog, { field, op, value }) {
    const f = catalog.find((x) => x.key === field);
    if (!f) return { ok: false, error: 'Champ indisponible.' };
    if (!OPS_ALL.has(op)) return { ok: false, error: 'Opérateur invalide.' };
    const allowed = new Set((OPERATORS[f.type] || []).map((o) => o.value));
    if (!allowed.has(op)) return { ok: false, error: `Opérateur incompatible avec « ${f.label} ».` };
    if (op === 'is_true' || op === 'is_false') return { ok: true, value: null };
    if (op === 'in') {
        const arr = Array.isArray(value) ? value
            : String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!arr.length) return { ok: false, error: 'Renseignez au moins une valeur.' };
        return { ok: true, value: f.type === 'number' ? arr.map(Number) : arr };
    }
    if (value === undefined || value === null || value === '') return { ok: false, error: 'Valeur requise.' };
    return { ok: true, value: f.type === 'number' ? Number(value) : value };
}

// Conditions personnalisées d'un organisme -> Map slug => { field, op, value }.
async function loadConditionMap(conn, orgId) {
    const m = new Map();
    let rows;
    try {
        [rows] = await conn.query(
            'SELECT slug, field, op, value FROM document_condition WHERE organization_id = ?',
            [orgId]
        );
    } catch (e) {
        if (e && e.code === 'ER_NO_SUCH_TABLE') return m;
        throw e;
    }
    for (const r of rows) {
        let value = r.value;
        try { value = r.value == null ? null : JSON.parse(r.value); } catch { /* garde brut */ }
        m.set(r.slug, { field: r.field, op: r.op, value });
    }
    return m;
}

module.exports = {
    ELIGIBLE_TABLES, TABLE_LABEL, OPERATORS, VIRTUALS, computeAge,
    introspectFields, getAllFields, getEnabledFields, loadDossierFactsMap,
    evalCondition, matchCustom, validateCondition, loadConditionMap,
};
