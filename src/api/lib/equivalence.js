// Équivalences de documents : ensembles de modèles alternatifs (« OU »). Le bon
// variant est retenu par dossier selon la CONDITION propre de chaque document
// (applies_when). Unique source de vérité du « OU » : parcours, tableau de session
// et arborescence d'archivage.
const { mergeSteps, parseApplies } = require('./documents.js');

// Équivalences par défaut (socle École Pizza) — toujours présentes, non supprimables.
const DEFAULT_EQUIVALENCES = [
    { key: 'def-devis', label: 'Devis', members: ['devis-particulier', 'devis-entreprise', 'devis-rs7404'] },
    { key: 'def-contrat', label: 'Contrat / Convention', members: ['contrat', 'contrat-rs7404', 'convention'] },
    { key: 'def-emargement', label: 'Émargement', members: ['emargement-5j', 'emargement-4j', 'emargement-5j-hygiene'] },
];

// Charge les équivalences (défauts + personnalisées de l'organisme).
async function loadEquivalences(conn, orgId) {
    let rows = [];
    try {
        [rows] = await conn.query('SELECT id, label, members FROM document_equivalence WHERE organization_id = ?', [orgId]);
    } catch (e) {
        if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; // migration 054 non jouée : défauts seuls
    }
    const org = rows.map((r) => {
        let members = [];
        try { members = JSON.parse(r.members) || []; } catch { members = []; }
        return { key: `org-${r.id}`, id: r.id, label: r.label || members.join(' / '), members, is_default: false };
    });
    return [...DEFAULT_EQUIVALENCES.map((d) => ({ ...d, is_default: true })), ...org];
}

// Map slug -> { group, label } (l'organisme surcharge les défauts sur les slugs communs).
function equivalenceMap(equivalences) {
    const m = new Map();
    for (const e of equivalences) for (const s of e.members) m.set(s, { group: e.key, label: e.label });
    return m;
}

// Deux étapes/documents sont-ils équivalents (même groupe « OU ») ?
function sameEquivalence(map, slugA, slugB) {
    const a = map.get(slugA); const b = map.get(slugB);
    return !!(a && b && a.group === b.group);
}

// Valide une équivalence : ≥2 modèles existants aux conditions DISTINCTES.
// `stepsBySlug` = Map slug -> étape fusionnée (applies_when).
function validateMembers(members, stepsBySlug) {
    const list = Array.isArray(members) ? [...new Set(members.filter(Boolean))] : [];
    if (list.length < 2) return { ok: false, error: 'Sélectionnez au moins deux documents.' };
    const sigs = new Set();
    for (const slug of list) {
        const s = stepsBySlug.get(slug);
        if (!s) return { ok: false, error: `Document inconnu : ${slug}.` };
        const sig = JSON.stringify(parseApplies(s.applies_when) || {});
        if (sigs.has(sig)) {
            return { ok: false, error: 'Deux documents ont la même condition : impossible de les distinguer.' };
        }
        sigs.add(sig);
    }
    return { ok: true, value: list };
}

module.exports = { DEFAULT_EQUIVALENCES, loadEquivalences, equivalenceMap, sameEquivalence, validateMembers, mergeSteps };
