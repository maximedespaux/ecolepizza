// Équivalences de documents : ensembles de modèles alternatifs (« OU »). Le bon
// variant est retenu par dossier selon la CONDITION propre de chaque document
// (applies_when). Unique source de vérité du « OU » : parcours, tableau de session
// et arborescence d'archivage.
const { mergeSteps, parseApplies } = require('./documents.js');

// Pas d'équivalences par défaut : la liste part vide (comme les conditions) ;
// l'organisme les définit entièrement dans Modèles → Équivalences.
const DEFAULT_EQUIVALENCES = [];

// Charge les équivalences personnalisées de l'organisme.
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

/* La CONDITION d'un document, en français. Sert le message de refus : « ces deux documents
   s'appliquent tous les deux au financement PARTICULIER » se comprend, « même signature JSON »
   non. Une condition vide se dit « sans condition » — c'est le cas le plus fréquent, et celui
   qu'on cherche à nommer. */
function conditionEnClair(applies) {
    const a = parseApplies(applies) || {};
    const bouts = [];
    if (a.financing) bouts.push(a.financing === 'PROFESSIONNEL' ? 'financement professionnel' : 'financement particulier');
    if (a.rs === true) bouts.push('formation certifiante');
    if (a.rs === false) bouts.push('formation non certifiante');
    if (a.hygiene === true) bouts.push('hygiène');
    if (a.jours != null) bouts.push(`${a.jours} jour${Number(a.jours) > 1 ? 's' : ''}`);
    /* Les conditions PERSO de l'organisme arrivent dans un tableau `conditions` : les rendre par
       `JSON.stringify` donnait « conditions = ["financeur-professionnel"] », des crochets et des
       guillemets au milieu d'une phrase française. Ce sont pourtant elles qu'on lit le plus
       souvent — le cas mesuré sur RS7404 en était une. */
    if (Array.isArray(a.conditions) && a.conditions.length) {
        bouts.push(a.conditions.map((c) => `« ${c} »`).join(' + '));
    }
    for (const [k, v] of Object.entries(a)) {
        if (!['financing', 'rs', 'hygiene', 'jours', 'conditions'].includes(k)) bouts.push(`${k} = ${JSON.stringify(v)}`);
    }
    return bouts.length ? bouts.join(' + ') : 'sans condition';
}

/**
 * Valide une équivalence : au moins deux documents EXISTANTS, aux conditions DISTINCTES.
 *
 * DEUX REFUS, et un seul est de la faute de qui clique.
 *
 * 1. UN MEMBRE QUI N'EXISTE PLUS ne bloque plus rien. Un document supprimé ou renommé laissait
 *    son slug dans le groupe, et ce cadavre faisait échouer TOUTE modification ultérieure :
 *    « Document inconnu : devis-particulier-copie » — un nom que l'utilisateur n'a jamais tapé,
 *    pour un groupe qu'il ne pouvait plus réparer par l'écran. Mesuré sur le parcours RS7404 :
 *    impossible d'ajouter la moindre variante au jalon « Devis particulier ».
 *    On les RETIRE donc, et on le DIT (`retires`) — supprimer en silence serait pire.
 *
 * 2. DEUX CONDITIONS IDENTIQUES restent un refus, et c'est le seul vrai. Un « OU » ne sert qu'à
 *    choisir : si deux variantes s'appliquent au même cas, rien ne permet de trancher au moment
 *    de générer. Le message NOMME les deux documents et la condition qu'ils partagent, au lieu
 *    d'annoncer un problème sans dire lequel.
 */
function validateMembers(members, stepsBySlug) {
    const brut = Array.isArray(members) ? [...new Set(members.filter(Boolean))] : [];
    const retires = brut.filter((slug) => !stepsBySlug.get(slug));
    const list = brut.filter((slug) => stepsBySlug.get(slug));
    if (list.length < 2) {
        return { ok: false, error: retires.length
            ? `Il ne reste qu'un document valide dans ce groupe : ${retires.join(', ')} n'existe plus. Reconstituez le groupe avec au moins deux documents.`
            : 'Sélectionnez au moins deux documents.' };
    }
    const parCondition = new Map();
    for (const slug of list) {
        const s = stepsBySlug.get(slug);
        const sig = JSON.stringify(parseApplies(s.applies_when) || {});
        if (parCondition.has(sig)) {
            const autre = parCondition.get(sig);
            const nom = (x) => (stepsBySlug.get(x)?.label || x);
            return { ok: false, error:
                `« ${nom(autre)} » et « ${nom(slug)} » s'appliquent au même cas (${conditionEnClair(s.applies_when)}) : `
                + 'rien ne permettrait de choisir entre les deux au moment de produire le document. '
                + 'Donnez-leur des conditions différentes dans Modèles de documents, ou choisissez une autre variante.' };
        }
        parCondition.set(sig, slug);
    }
    return { ok: true, value: list, retires };
}

module.exports = { DEFAULT_EQUIVALENCES, loadEquivalences, equivalenceMap, sameEquivalence, validateMembers, mergeSteps, conditionEnClair };
