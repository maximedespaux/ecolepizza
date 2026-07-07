// Module Comptabilité / Gestion — cibles et règles d'analyse (pas de compta légale).
// Chaque poste de dépense est comparé à une cible en % du CA → code couleur + conseil.

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
            const v = Number(saved[cat]);
            if (Number.isFinite(v) && v >= 0 && v <= 100) out[cat] = v;
        }
    }
    return out;
}

module.exports = {
    EXPENSE_CATEGORIES, CATEGORY_LABELS, DEFAULT_TARGETS, DEFAULT_DIVIDENDE_CIBLE,
    REVENU_CATEGORIES, statutFor, conseilFor, mergeTargets,
};
