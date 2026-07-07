// Remplissage des modèles Word réels (.docx) avec les données du dossier.
// docxtemplater (pur Node). Les jetons utilisent { } et conservent l'orthographe
// d'origine (« Niveau suggérer », « Téléphone », « D_Naissance »…).
//
// Multi-tenant : chaque modèle est identifié par un « slug ». La source du fichier
// est fournie par l'appelant (loadTemplate(slug) -> Buffer) : modèle propre à
// l'organisme en base, sinon modèle par défaut fourni avec l'application.
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { resolveTokens } = require('./tokens.js');

const TPL_DIR = path.join(__dirname, '..', 'templates');

// Catalogue des modèles : slug -> libellé + fichier par défaut fourni.
const TEMPLATE_SLUGS = [
    { slug: 'devis-particulier', label: 'Devis — Particulier', file: 'Devis Particulier_.docx' },
    { slug: 'devis-entreprise', label: 'Devis — Entreprise', file: 'Devis Entreprise.docx' },
    { slug: 'devis-rs7404', label: 'Devis — RS7404 (certifiante)', file: 'Devis Fabriquer des pizzas artisanales RS7404.docx' },
    { slug: 'contrat', label: 'Contrat de formation', file: 'Contrat.docx' },
    { slug: 'contrat-rs7404', label: 'Contrat — RS7404 (certifiante)', file: 'Contrat Fabriquer des pizzas artisanales RS7404.docx' },
    { slug: 'convention', label: 'Convention de formation', file: 'Convention.docx' },
    { slug: 'convocation', label: "Convocation à l'examen", file: 'Convocation.docx' },
    { slug: 'invitation', label: 'Invitation', file: 'Invitation.docx' },
    { slug: 'droit-image', label: "Droit à l'image", file: 'Droit Image.docx' },
    { slug: 'attestation-hygiene', label: 'Attestation Hygiène', file: 'Attestation Hygiène.docx' },
    { slug: 'certificat-realisation', label: 'Certificat de réalisation', file: 'Certificat de réalisation.docx' },
    { slug: 'emargement-4j', label: "Feuille d'émargement 4J", file: 'Feuille d_émargement 4J.docx' },
    { slug: 'emargement-5j', label: "Feuille d'émargement 5J", file: 'Feuille d_émargement 5J.docx' },
    { slug: 'emargement-5j-hygiene', label: "Feuille d'émargement 5J + hygiène", file: 'Feuille d_émargement 5J + hygiène.docx' },
    { slug: 'fiche-semaine', label: "Fiche d'expression de besoin", file: 'Fiche Semaine.docx' },
    { slug: 'evaluation-financeur', label: 'Évaluation Financeur', file: 'Évaluation Financeur.docx' },
    { slug: 'evaluation-manageur', label: 'Évaluation Manageur', file: 'Évaluation Manageur.docx' },
];
const SLUG_MAP = Object.fromEntries(TEMPLATE_SLUGS.map((t) => [t.slug, t]));

// type de document (+ financement / certifiante / hygiène / durée) -> slug de modèle
function templateSlugFor(type, o = {}) {
    const pro = o.financing === 'PROFESSIONNEL';
    switch (type) {
        case 'DEVIS': return o.rsCode ? 'devis-rs7404' : pro ? 'devis-entreprise' : 'devis-particulier';
        case 'CONTRAT': return o.rsCode ? 'contrat-rs7404' : 'contrat';
        case 'CONVENTION': return 'convention';
        case 'CONVOCATION': return 'convocation';
        case 'INVITATION': return 'invitation';
        case 'DROIT_IMAGE': return 'droit-image';
        case 'ATTESTATION_HYGIENE': return 'attestation-hygiene';
        case 'CERTIFICAT_REALISATION': return 'certificat-realisation';
        case 'EMARGEMENT':
            return o.hygiene ? 'emargement-5j-hygiene' : Number(o.jours) === 4 ? 'emargement-4j' : 'emargement-5j';
        case 'FICHE_SEMAINE': return 'fiche-semaine';
        case 'EVALUATION_FINANCEUR': return 'evaluation-financeur';
        case 'EVALUATION_MANAGEUR': return 'evaluation-manageur';
        default: return null;
    }
}

// Modèle par défaut fourni avec l'application (Buffer) pour un slug, ou null.
function defaultTemplateBuffer(slug) {
    const entry = SLUG_MAP[slug];
    if (!entry) return null;
    const p = path.join(TPL_DIR, entry.file);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// Corps HTML par défaut (modèle « builder » fourni avec l'application) pour un slug.
const HTML_DIR = path.join(__dirname, '..', 'templates_html');
function defaultTemplateHtml(slug) {
    if (!/^[a-z0-9-]+$/.test(String(slug || ''))) return null;
    const p = path.join(HTML_DIR, `${slug}.html`);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/** Table de jetons { Jeton: valeur } à partir du contexte (catalogue partagé). */
function buildTokens(ctx) {
    return resolveTokens(ctx);
}

/** Remplit un modèle .docx (Buffer) avec le contexte. Renvoie { buffer, filename }. */
function renderTemplate(templateBuffer, ctx, slug) {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
        delimiters: { start: '{', end: '}' },
        paragraphLoop: true, linebreaks: true,
        nullGetter: () => '',
    });
    doc.render(buildTokens(ctx));
    const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    const who = [ctx.learner?.first_name, ctx.learner?.last_name].filter(Boolean).join(' ').trim();
    const label = (SLUG_MAP[slug]?.label) || slug || 'document';
    const filename = (who ? `${label} - ${who}` : label).replace(/[\\/:*?"<>|]/g, '') + '.docx';
    return { buffer, filename };
}

/**
 * Convenance : choisit le slug, charge le modèle (loadTemplate(slug) ou défaut),
 * et remplit. Renvoie { buffer, filename } ou null si aucun modèle.
 */
function fillDocument(type, ctx, loadTemplate) {
    const f = (ctx.formations && ctx.formations[0]) || {};
    const slug = templateSlugFor(type, {
        financing: f.financing, rsCode: f.rs_code, hygiene: !!f.hygiene, jours: f.days,
    });
    if (!slug) return null;
    const buf = (loadTemplate && loadTemplate(slug)) || defaultTemplateBuffer(slug);
    if (!buf) return null;
    return renderTemplate(buf, ctx, slug);
}

module.exports = {
    TEMPLATE_SLUGS, templateSlugFor, defaultTemplateBuffer, defaultTemplateHtml,
    renderTemplate, buildTokens, fillDocument,
};
