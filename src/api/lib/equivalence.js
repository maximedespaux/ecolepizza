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
/* OÙ VIT UN DOCUMENT. Un document de GROUPE (`company_level`) ne s'affiche jamais dans le flux
   du parcours : il est géré dans l'onglet « À l'arrivée via une entreprise ». Le nommer sans le
   situer opposait à l'utilisateur un document qu'il ne pouvait pas voir depuis l'écran où il se
   trouvait — c'est exactement ce qui s'est produit : « Devis entreprise » bloquait un « OU » du
   parcours du dossier, sans apparaître nulle part dans ce parcours. */
const situationDe = (s) => (s && s.company_level
    ? " (document de groupe, onglet « À l'arrivée via une entreprise »)" : '');

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
function validateMembers(members, stepsBySlug, ajoute = null) {
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
            /* QUI EST DÉJÀ LÀ, QUI ARRIVE. Sans cette distinction, le message opposait deux
             * documents sans dire lequel l'utilisateur venait de choisir — et surtout sans dire
             * que l'autre était DÉJÀ dans le groupe. On lisait « Devis entreprise et Devis
             * professionnel s'appliquent au même cas » en croyant avoir cliqué de travers, alors
             * que le conflit venait d'un membre invisible depuis cet écran. */
            const dejaLa = ajoute && slug === ajoute ? autre : (ajoute && autre === ajoute ? slug : autre);
            const nouveau = dejaLa === autre ? slug : autre;
            const suite = ajoute
                ? `« ${nom(dejaLa)} »${situationDe(stepsBySlug.get(dejaLa))} est DÉJÀ dans ce choix « OU », `
                  + `et s'applique au même cas que « ${nom(nouveau)} » (${conditionEnClair(s.applies_when)})`
                : `« ${nom(autre)} »${situationDe(stepsBySlug.get(autre))} et « ${nom(slug)} »${situationDe(s)} `
                  + `s'appliquent au même cas (${conditionEnClair(s.applies_when)})`;
            return { ok: false, error:
                suite + ' : rien ne permettrait de choisir entre les deux au moment de produire le document. '
                + `Retirez « ${nom(dejaLa)} » de ce choix, ou donnez-leur des conditions différentes dans Modèles de documents.` };
        }
        parCondition.set(sig, slug);
    }
    return { ok: true, value: list, retires };
}

/**
 * LES GROUPES « OU » MAL CONDITIONNÉS, repérés AVANT qu'on ne bute dessus.
 *
 * Jusqu'ici le problème ne se manifestait qu'au moment d'ajouter une variante : on cliquait, on
 * recevait un refus. Or un groupe déjà cassé le reste en silence — et il produit alors le mauvais
 * document, ou aucun, sans que rien ne l'annonce. C'est exactement le genre de défaut qu'on
 * découvre le jour où un stagiaire reçoit un devis qui n'est pas le sien.
 *
 * DEUX DÉFAUTS, et seulement ceux-là : ils se démontrent, contrairement à « il manque peut-être
 * un cas ».
 *   · CONDITIONS IDENTIQUES — deux variantes s'appliquent au même cas. Rien ne permet de choisir
 *     au moment de produire : l'une des deux sortira, arbitrairement.
 *   · GROUPE À UNE SEULE VARIANTE — un « OU » qui n'offre plus de choix. Arrive quand un membre
 *     a été supprimé ou renommé. Si la variante restante porte une condition restrictive, le
 *     jalon ne produit RIEN pour tous les autres cas.
 *
 * @param membres  slugs du groupe
 * @param bySlug   Map slug -> étape fusionnée (label, applies_when)
 * @returns null si le groupe est sain, sinon { type, texte }
 */
function diagnostiquerGroupe(membres, bySlug) {
    const vivants = [...new Set((membres || []).filter((x) => bySlug.get(x)))];
    const nom = (x) => (bySlug.get(x)?.label || x);
    if (vivants.length < 2) {
        const perdus = (membres || []).filter((x) => !bySlug.get(x));
        return {
            type: 'groupe-incomplet',
            texte: perdus.length
                ? `Ce choix « OU » n'a plus qu'une variante : ${perdus.map((x) => `« ${x} »`).join(', ')} n'existe plus. `
                  + 'Si la variante restante porte une condition, aucun document ne sera produit dans les autres cas.'
                : 'Ce choix « OU » n\'a qu\'une seule variante : il ne propose donc aucun choix.',
        };
    }
    const parCondition = new Map();
    for (const slug of vivants) {
        const sig = JSON.stringify(parseApplies(bySlug.get(slug).applies_when) || {});
        if (parCondition.has(sig)) {
            const autre = parCondition.get(sig);
            return {
                type: 'conditions-identiques',
                texte: `« ${nom(autre)} »${situationDe(bySlug.get(autre))} et « ${nom(slug)} »${situationDe(bySlug.get(slug))} s'appliquent au même cas `
                    + `(${conditionEnClair(bySlug.get(slug).applies_when)}) : rien ne permet de choisir entre les deux `
                    + 'au moment de produire le document — l\'un des deux sortira au hasard. '
                    + 'Donnez-leur des conditions différentes dans Modèles de documents.',
            };
        }
        parCondition.set(sig, slug);
    }
    return null;
}

/** Les groupes cassés de l'organisme, indexés par slug de membre (pour marquer un jalon). */
function alertesParSlug(equivalences, bySlug) {
    const out = new Map();
    for (const eq of equivalences || []) {
        const pb = diagnostiquerGroupe(eq.members, bySlug);
        if (!pb) continue;
        for (const m of eq.members || []) out.set(m, { ...pb, groupe: eq.label || eq.key });
    }
    return out;
}

module.exports = { DEFAULT_EQUIVALENCES, loadEquivalences, equivalenceMap, sameEquivalence, validateMembers, mergeSteps, conditionEnClair, diagnostiquerGroupe, alertesParSlug };
