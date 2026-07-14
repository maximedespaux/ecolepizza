// Workflow documentaire piloté par les données.
//
// Chaque « étape » d'un dossier est une pièce à produire/suivre : intitulé, type
// (generated_document.type), position, signature, conditions d'application.
// Les étapes par défaut ci-dessous constituent le socle École Pizza ; chaque
// organisme peut les surcharger / en ajouter via document_template (cf.
// template.controller : loadOrgSteps → mergeSteps).

// applies_when : sous-ensemble de { financing, rs, hygiene, jours, agefice }.
// Une clé absente = « peu importe ». `rs`/`hygiene`/`agefice` sont des booléens.
// Parcours (hors RS) : Fiche → Devis+CGV → Contrat/Convention → Invitation+Livret
// → Test positionnement → Droit image → Émargement → Certificat (+Attestation
// d'assiduité si AGEFICE) → Diplôme → Évaluation de satisfaction.
// Aucune condition d'application par défaut : chaque document démarre « sans
// condition » ; l'organisme les définit lui-même (document settings / Conditions).
const DEFAULT_STEPS = [
    { slug: 'fiche-semaine', label: "Fiche d'expression de besoin", doc_type: 'FICHE_SEMAINE', sort_order: 10, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'devis-particulier', label: 'Devis particulier', doc_type: 'DEVIS', sort_order: 20, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'devis-entreprise', label: 'Devis entreprise', doc_type: 'DEVIS', sort_order: 20, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'devis-rs7404', label: 'Devis RS7404', doc_type: 'DEVIS', sort_order: 20, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'cgv', label: 'Conditions générales de vente (CGV)', doc_type: 'CGV', sort_order: 22, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'contrat', label: 'Contrat de formation', doc_type: 'CONTRAT', sort_order: 30, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'contrat-rs7404', label: 'Contrat RS7404', doc_type: 'CONTRAT', sort_order: 30, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'convention', label: 'Convention de formation', doc_type: 'CONVENTION', sort_order: 30, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'invitation', label: 'Invitation', doc_type: 'INVITATION', sort_order: 40, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'convocation', label: "Convocation à l'examen", doc_type: 'CONVOCATION', sort_order: 40, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'livret-accueil', label: "Livret d'accueil", doc_type: 'LIVRET_ACCUEIL', sort_order: 42, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'test-positionnement', label: 'Test de positionnement', doc_type: 'TEST_POSITIONNEMENT', sort_order: 50, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'droit-image', label: "Droit à l'image", doc_type: 'DROIT_IMAGE', sort_order: 60, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'emargement-5j', label: "Feuille d'émargement 5J", doc_type: 'EMARGEMENT', sort_order: 70, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'emargement-4j', label: "Feuille d'émargement 4J", doc_type: 'EMARGEMENT', sort_order: 70, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'emargement-5j-hygiene', label: "Feuille d'émargement 5J + hygiène", doc_type: 'EMARGEMENT', sort_order: 70, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'attestation-hygiene', label: 'Attestation Hygiène', doc_type: 'ATTESTATION_HYGIENE', sort_order: 75, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'certificat-realisation', label: 'Certificat de réalisation', doc_type: 'CERTIFICAT_REALISATION', sort_order: 80, signable: 1, stagiaire_sign: 0, applies_when: {} },
    { slug: 'attestation-assiduite', label: "Attestation d'assiduité", doc_type: 'ATTESTATION_ASSIDUITE', sort_order: 82, signable: 1, stagiaire_sign: 1, applies_when: {} },
    { slug: 'diplome', label: 'Diplôme', doc_type: 'DIPLOME', sort_order: 90, signable: 0, stagiaire_sign: 0, applies_when: {} },
    { slug: 'evaluation-satisfaction', label: 'Évaluation de satisfaction', doc_type: 'EVALUATION_SATISFACTION', sort_order: 100, signable: 0, stagiaire_sign: 0, applies_when: {} },
];
const DEFAULT_SLUGS = new Set(DEFAULT_STEPS.map((d) => d.slug));

// Normalise applies_when (objet ou JSON) -> objet.
function parseApplies(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch { return {}; }
}

// Un dossier ctx = { financing, rsCode, hygiene, jours }.
function matchStep(applies, ctx) {
    const a = parseApplies(applies);
    if (a.financing != null && ctx.financing !== a.financing) return false;
    if (a.rs != null && !!ctx.rsCode !== !!a.rs) return false;
    if (a.hygiene != null && !!ctx.hygiene !== !!a.hygiene) return false;
    if (a.jours != null && Number(ctx.jours) !== Number(a.jours)) return false;
    if (a.agefice != null && !!ctx.agefice !== !!a.agefice) return false;
    return true;
}

/**
 * Fusionne les étapes par défaut avec les lignes document_template d'un organisme.
 * Une ligne surcharge le défaut de même slug (champs non nuls), en ajoute de
 * nouveaux, ou en désactive (active=0). Renvoie une liste d'étapes normalisées.
 */
function mergeSteps(rows = []) {
    const bySlug = new Map();
    for (const d of DEFAULT_STEPS) {
        bySlug.set(d.slug, {
            slug: d.slug, label: d.label, doc_type: d.doc_type, sort_order: d.sort_order,
            signable: d.signable, stagiaire_sign: d.stagiaire_sign, applies_when: d.applies_when,
            or_group: d.or_group || null, company_level: d.company_level ? 1 : 0, company_sign: d.company_sign ? 1 : 0,
            active: 1, has_file: false, is_default: true, customized: false,
        });
    }
    for (const r of rows) {
        // Tombstone : étape supprimée définitivement pour cet organisme.
        if (r.deleted) { bySlug.delete(r.slug); continue; }
        const base = bySlug.get(r.slug) || {
            slug: r.slug, label: r.slug, doc_type: r.doc_type || null, sort_order: 100,
            signable: 0, stagiaire_sign: 0, applies_when: {}, or_group: null, company_level: 0, company_sign: 0, active: 1, has_file: false,
            is_default: false, customized: false,
        };
        const m = { ...base, customized: true };
        if (r.label != null) m.label = r.label;
        if (r.doc_type != null) m.doc_type = r.doc_type;
        if (r.sort_order != null) m.sort_order = r.sort_order;
        if (r.signable != null) m.signable = r.signable;
        if (r.stagiaire_sign != null) m.stagiaire_sign = r.stagiaire_sign;
        if (r.applies_when != null) m.applies_when = parseApplies(r.applies_when);
        if (r.company_level != null) m.company_level = r.company_level ? 1 : 0;
        if (r.company_sign != null) m.company_sign = r.company_sign ? 1 : 0;
        if (r.active != null) m.active = r.active;
        m.has_file = !!r.has_file;
        bySlug.set(r.slug, m);
    }
    return [...bySlug.values()].sort((a, b) => a.sort_order - b.sort_order || String(a.label).localeCompare(String(b.label)));
}

/**
 * Étapes applicables à un dossier (filtrées + ordonnées), au format historique
 * { num, type, label, signable, stagiaireSign, slug }.
 */
function stepsToDocSet(steps, ctx) {
    return steps
        .filter((s) => s.active && matchStep(s.applies_when, ctx))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s, i) => ({
            num: i + 1, slug: s.slug, type: s.doc_type, label: s.label, sort_order: s.sort_order,
            signable: !!s.signable, stagiaireSign: !!s.stagiaire_sign,
        }));
}

// Convenance (socle par défaut, sans base) — repli quand l'organisme n'a rien personnalisé.
function documentSetFor(ctx) {
    return stepsToDocSet(mergeSteps([]), ctx);
}

/**
 * Le stagiaire doit-il signer CE document ? Unique source de vérité : le flag
 * `stagiaire_sign` du modèle (Modeles de document), résolu par slug de modèle en
 * priorité, sinon par type. `steps` = étapes fusionnées (mergeSteps / loadOrgSteps).
 */
function stagiaireSignsDoc(steps, doc) {
    if (!doc) return false;
    if (doc.template_slug) {
        const s = steps.find((x) => x.slug === doc.template_slug);
        if (s) return !!s.stagiaire_sign;
    }
    if (doc.type) {
        const byType = steps.filter((x) => x.doc_type === doc.type);
        if (byType.length) return byType.some((x) => !!x.stagiaire_sign);
    }
    return false;
}

/**
 * Ce document doit-il être signé par L'ENTREPRISE (représentant) plutôt que par le
 * stagiaire, lorsque le dossier est financé par une entreprise ? Flag `company_sign`
 * du modèle (ex. devis / convention entreprise). Résolu par slug puis par type.
 */
function companySignsDoc(steps, doc) {
    if (!doc) return false;
    if (doc.template_slug) {
        const s = steps.find((x) => x.slug === doc.template_slug);
        if (s) return !!s.company_sign;
    }
    if (doc.type) {
        const byType = steps.filter((x) => x.doc_type === doc.type);
        if (byType.length) return byType.some((x) => !!x.company_sign);
    }
    return false;
}

/**
 * L'ORGANISME doit-il signer ce document ? Piloté par le flag `signable` du modèle
 * (« À signer »). La signature organisme est appliquée automatiquement à l'envoi.
 */
function orgSignsDoc(steps, doc) {
    if (!doc) return false;
    if (doc.template_slug) {
        const s = steps.find((x) => x.slug === doc.template_slug);
        if (s) return !!s.signable;
    }
    if (doc.type) {
        const byType = steps.filter((x) => x.doc_type === doc.type);
        if (byType.length) return byType.some((x) => !!x.signable);
    }
    return false;
}

// Conditions AU NIVEAU FORMATION uniquement (rs / hygiène / jours). On ignore
// financing/agefice (propres au dossier) : c'est la liste des documents candidats
// d'une formation, avant application des conditions du dossier.
function matchFormation(applies, program) {
    const a = parseApplies(applies);
    if (a.rs != null && !!program.rs_code !== !!a.rs) return false;
    if (a.hygiene != null && !!program.hygiene !== !!a.hygiene) return false;
    if (a.jours != null && Number(program.days) !== Number(a.jours)) return false;
    return true;
}

module.exports = { DEFAULT_STEPS, DEFAULT_SLUGS, matchStep, matchFormation, parseApplies, mergeSteps, stepsToDocSet, documentSetFor, stagiaireSignsDoc, companySignsDoc, orgSignsDoc };
