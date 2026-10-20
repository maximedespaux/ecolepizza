// Module Comptabilité / Gestion — cibles et règles d'analyse (pas de compta légale).
// Chaque poste de dépense est comparé à une cible en % du CA → code couleur + conseil.

// Une cible se TAPE (« 12,5 ») : lue en français, sinon elle était ignorée en silence.
const { lireMontant } = require('./montantSaisi.js');

const EXPENSE_CATEGORIES = [
    'MATIERES_PREMIERES',
    'SALAIRES',
    'LOYER',
    'MARKETING',
    'ENERGIE',
    'DIVERS',
];

const CATEGORY_LABELS = {
    MATIERES_PREMIERES: 'Matières premières',
    SALAIRES: 'Salaires & charges',
    LOYER: 'Loyer & locaux',
    MARKETING: 'Marketing & envois',
    ENERGIE: 'Énergie',
    DIVERS: 'Divers',
};

// Cibles de départ (ajustables par l'organisme). Valeurs médianes des fourchettes :
// matières 25–30 %, salaires 30 %, loyer 10 %, marketing 5–10 %, énergie 5 %, divers 5 %.
const DEFAULT_TARGETS = {
    MATIERES_PREMIERES: 27.5,
    SALAIRES: 30,
    LOYER: 10,
    MARKETING: 7.5,
    ENERGIE: 5,
    DIVERS: 5,
};

const DEFAULT_DIVIDENDE_CIBLE = 10;

const REVENU_CATEGORIES = ['COMMISSION', 'SUBVENTION', 'AUTRE'];

// Un poste est vert s'il respecte sa cible, orange jusqu'à +20 % de dépassement
// relatif, rouge au-delà. (Ex. cible 10 % → vert ≤10 %, orange ≤12 %, rouge >12 %.)
function statutFor(pct, cible) {
    if (pct <= cible) return 'vert';
    if (pct <= cible * 1.2) return 'orange';
    return 'rouge';
}

function conseilFor(cat, statut, pct, cible) {
    if (statut === 'vert') return `Sous la cible (${cible}%). Marge de manœuvre disponible.`;
    const ecart = Math.round((pct - cible) * 10) / 10;
    if (statut === 'orange') return `Léger dépassement (+${ecart} pts). À surveiller.`;
    const conseils = {
        MATIERES_PREMIERES: 'Renégocier avec les fournisseurs partenaires ou réduire le gaspillage.',
        SALAIRES: "Poste lourd : vérifier le taux de remplissage des sessions avant d'embaucher.",
        LOYER: 'Loyer élevé vs CA : envisager un local mutualisé ou renégocier le bail.',
        MARKETING: 'Recentrer le budget sur les canaux qui convertissent réellement.',
        ENERGIE: "Contrôler la consommation des fours et comparer les contrats d'énergie.",
        DIVERS: 'Trop de dépenses non classées : les ventiler dans les bons postes.',
    };
    return `Dépassement notable (+${ecart} pts). ${conseils[cat]}`;
}

// Fusionne des cibles enregistrées (partielles) avec les défauts.
function mergeTargets(saved) {
    const out = { ...DEFAULT_TARGETS };
    if (saved && typeof saved === 'object') {
        for (const cat of EXPENSE_CATEGORIES) {
            const v = lireMontant(saved[cat]);
            if (Number.isFinite(v) && v >= 0 && v <= 100) out[cat] = v;
        }
    }
    return out;
}

/* ── GESTION PAR ENTITÉ ÉMETTRICE (migration 212) ─────────────────────────────────────────────────
 * Chaque entité (billing_profile) peut déclarer QUELLES sources de CA elle a, et des cibles PROPRES.
 * Lu par la Comptabilité quand une entité est sélectionnée ; partagé avec l'écran Facturation qui les
 * règle. Tolérant : colonnes absentes (212 non jouée) → tout retombe sur le comportement global. */

// Les trois sources de chiffre d'affaires, dans l'ordre d'affichage.
const CA_STREAMS = ['inscriptions', 'materiel', 'divers'];

/* Les sources déclarées d'une entité, depuis sa ligne billing_profile. Colonne absente, valeur
 * nulle, ou entité « Toutes » (row nul) → les trois sources (true), comportement d'avant. */
function streamsDeLentite(row) {
    const a = (col) => !row || row[col] === undefined || row[col] === null || Number(row[col]) !== 0;
    return { inscriptions: a('revenue_inscriptions'), materiel: a('revenue_materiel'), divers: a('revenue_divers') };
}

/* On MASQUE une source non déclarée — mais JAMAIS si elle porte un montant réel (on ne cache pas de
 * l'argent). `montants` = { inscriptions, materiel, divers } en euros. Rend les mêmes clés en booléen
 * « à montrer ». Pur et testable ; même règle côté écran et côté serveur. */
function streamsAMontrer(streams, montants) {
    const m = montants || {};
    const sur = (k) => (streams ? streams[k] !== false : true) || Number(m[k] || 0) !== 0;
    return { inscriptions: sur('inscriptions'), materiel: sur('materiel'), divers: sur('divers') };
}

/* Les cibles PROPRES d'une entité, ou null si elle n'en a pas (→ cibles globales de l'organisme).
 * Rend { targets, dividende } : targets l'objet JSON stocké (ou null), dividende un nombre (ou null). */
function ciblesDeLentite(row) {
    if (!row) return null;
    let targets = null;
    if (row.compta_targets) { try { targets = JSON.parse(row.compta_targets); } catch { targets = null; } }
    const dividende = row.compta_dividende == null ? null : Number(row.compta_dividende);
    if (!targets && dividende == null) return null;
    return { targets, dividende: Number.isFinite(dividende) ? dividende : null };
}

/* Pour l'ENREGISTREMENT depuis l'écran Facturation. Une entité a des cibles propres OU non (tout ou
 * rien, piloté par une case à cocher). `actives` faux → on efface (null, null) : retour aux cibles
 * globales. Sinon, un jeu COMPLET (les défauts comblent ce qui n'est pas saisi) et un dividende borné. */
function ciblesPourBase(actives, targetsRaw, dividendeRaw) {
    if (!actives) return { targets: null, dividende: null };
    let d = lireMontant(dividendeRaw);
    if (!Number.isFinite(d) || d < 0 || d > 100) d = DEFAULT_DIVIDENDE_CIBLE;
    return { targets: JSON.stringify(mergeTargets(targetsRaw)), dividende: d };
}

module.exports = {
    EXPENSE_CATEGORIES, CATEGORY_LABELS, DEFAULT_TARGETS, DEFAULT_DIVIDENDE_CIBLE,
    REVENU_CATEGORIES, statutFor, conseilFor, mergeTargets,
    CA_STREAMS, streamsDeLentite, streamsAMontrer, ciblesDeLentite, ciblesPourBase,
};
