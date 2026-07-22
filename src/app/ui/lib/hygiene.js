// Maîtrise sanitaire (HACCP) — configuration domaine.
//
// C'est la SOURCE UNIQUE des 8 registres : chaque config décrit son formulaire (champs), son
// calcul de conformité (seuils réglementaires) et le rendu de ses lignes. Le composant
// HygieneRegister.jsx est générique — il ne connaît aucun registre en particulier, il lit ces
// objets. Ajouter un registre = ajouter une entrée ici, sans toucher au composant.
//
// Règle de nommage des champs : `name` pointe soit une COLONNE du journal (title, value_num,
// note, corrective, occurred_at, due_at, equipment_id, task_id, status), soit une clé du JSON
// `meta` via le préfixe « meta: » (ex. « meta:supplier »). Le composant assemble le payload
// à partir de ça — voir buildPayload().
//
// Seuils : issus du paquet hygiène (règl. CE 852/2004) et des bonnes pratiques. Ils sont indicatifs
// et surtout PORTÉS PAR L'ÉQUIPEMENT (target_min/target_max) : un relevé se juge contre le seuil
// de SON point de contrôle, pas contre une constante figée.

// ── Libellés & tons ───────────────────────────────────────────────────────────────────────────
export const STATUS_META = {
    CONFORME:     { label: 'Conforme',      tone: 'ok' },
    NON_CONFORME: { label: 'Non conforme',  tone: 'bad' },
    A_VERIFIER:   { label: 'À vérifier',    tone: 'warn' },
    FAIT:         { label: 'Fait',          tone: 'ok' },
    OUVERT:       { label: 'Ouverte',       tone: 'bad' },
    RESOLU:       { label: 'Résolue',       tone: 'ok' },
    NA:           { label: '—',             tone: 'muted' },
};

export const EQUIP_TYPES = {
    FROID:       { label: 'Froid positif (0 à +4 °C)', icon: 'thermometer', min: 0,    max: 4 },
    CONGELATEUR: { label: 'Congélateur (≤ -18 °C)',    icon: 'thermometer', min: null, max: -18 },
    CHAUD:       { label: 'Maintien / cuisson (≥ 63 °C)', icon: 'flame',    min: 63,   max: null },
    FOUR:        { label: 'Four',        icon: 'flame',    min: null, max: null },
    PETRIN:      { label: 'Pétrin',      icon: 'settings', min: null, max: null },
    FRITEUSE:    { label: 'Friteuse',    icon: 'utensils', min: null, max: null },
    AUTRE:       { label: 'Autre',       icon: 'settings', min: null, max: null },
};

export const FREQUENCIES = {
    QUOTIDIEN:   'Quotidien',
    HEBDO:       'Hebdomadaire',
    MENSUEL:     'Mensuel',
    TRIMESTRIEL: 'Trimestriel',
    APRES_USAGE: 'Après chaque usage',
};

// Les trois colonnes du hub — reprises des logiciels HACCP du marché (e-pack, Kooklin) pour un
// tableau de bord lisible d'un coup d'œil : chaque domaine sa couleur.
export const GROUPS = [
    { key: 'TRACA',   label: 'Traçabilité',        accent: 'amber' },
    { key: 'TEMP',    label: 'Températures',        accent: 'blue' },
    { key: 'HYGIENE', label: 'Hygiène & audits',   accent: 'green' },
];

// Points de contrôle proposés au premier lancement (aucun équipement encore créé).
export const DEFAULT_EQUIPMENT = [
    { name: 'Chambre froide', type: 'FROID', target_min: 0, target_max: 4, unit: '°C' },
    { name: 'Réfrigérateur',  type: 'FROID', target_min: 0, target_max: 4, unit: '°C' },
    { name: 'Congélateur',    type: 'CONGELATEUR', target_min: null, target_max: -18, unit: '°C' },
    { name: 'Four',           type: 'FOUR', target_min: null, target_max: null, unit: '°C' },
    { name: 'Friteuse',       type: 'FRITEUSE', target_min: null, target_max: null, unit: '°C' },
];

// Plan de nettoyage proposé au premier lancement.
export const DEFAULT_CLEANING = [
    { zone: 'Plan de travail', task: 'Nettoyer et désinfecter', frequency: 'APRES_USAGE', product: 'Détergent-désinfectant' },
    { zone: 'Sol du labo',     task: 'Balayer, laver, désinfecter', frequency: 'QUOTIDIEN', product: 'Dégraissant sol' },
    { zone: 'Pétrin',          task: 'Démonter, laver, sécher', frequency: 'APRES_USAGE', product: 'Détergent alimentaire' },
    { zone: 'Chambre froide',  task: 'Nettoyer parois et clayettes', frequency: 'HEBDO', product: 'Désinfectant' },
    { zone: 'Hotte / filtres', task: 'Dégraisser les filtres', frequency: 'HEBDO', product: 'Dégraissant' },
];

// Calcul de conformité générique d'un relevé de température : on juge la valeur contre les
// seuils de l'équipement choisi. Un seuil manquant = pas de borne de ce côté.
export function tempStatus(value, equip) {
    if (value == null || value === '' || !equip) return null;
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    const min = equip.target_min != null ? Number(equip.target_min) : null;
    const max = equip.target_max != null ? Number(equip.target_max) : null;
    if (min != null && v < min) return 'NON_CONFORME';
    if (max != null && v > max) return 'NON_CONFORME';
    if (min == null && max == null) return null; // équipement sans seuil (four…) : pas de verdict auto
    return 'CONFORME';
}

// Seuil réglementaire des composés polaires d'une huile de friture : au-delà de 25 %, l'huile
// doit être changée (arrêté du 8 oct. 1997 / règl. européen).
export const HUILE_POLAIRES_MAX = 25;

// ── Les 8 registres ───────────────────────────────────────────────────────────────────────────
// `fields[].type` : equipment | task | number | text | textarea | date | datetime | select | radio
// `primary/secondary/badge` : (entry) => string  (rendu de la ligne dans la liste — PAS de JSX)
export const REGISTERS = [
    {
        key: 'temperature', register: 'TEMPERATURE', group: 'TEMP', scheduling: 'scheduled', deadlineHour: 20, batchMode: 'temperature',
        title: 'Relevés de température', short: 'Température', icon: 'thermometer', accent: 'blue',
        intro: 'Chaîne du froid et du chaud. Chaque relevé est comparé au seuil de l’équipement : alerte immédiate si la température sort de la zone.',
        needsEquipment: true, autoStatus: 'temperature',
        fields: [
            { name: 'equipment_id', label: 'Point de contrôle', type: 'equipment', required: true },
            { name: 'value_num', label: 'Température relevée', type: 'number', unit: '°C', step: '0.1', required: true, autofocus: true },
            { name: 'occurred_at', label: 'Date et heure', type: 'datetime' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => e.equipment_name || 'Relevé',
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} ${e.unit || '°C'}` : ''),
    },
    {
        key: 'refroidissement', register: 'REFROIDISSEMENT', group: 'TEMP', scheduling: 'event',
        title: 'Refroidissement rapide', short: 'Refroidissement', icon: 'thermometer', accent: 'blue',
        intro: 'Passer de +63 °C à +10 °C à cœur en moins de 2 heures. On enregistre la température finale et la durée.',
        autoStatus: 'refroid',
        fields: [
            { name: 'title', label: 'Préparation', type: 'text', required: true, autofocus: true, placeholder: 'Sauce bolognaise' },
            { name: 'value_num', label: 'Température finale à cœur', type: 'number', unit: '°C', step: '0.1', required: true, help: 'Objectif : ≤ 10 °C.' },
            { name: 'meta:duree_min', label: 'Durée du refroidissement', type: 'number', unit: 'min', step: '1', optional: true, help: 'Objectif : ≤ 120 min.' },
            { name: 'occurred_at', label: 'Date et heure', type: 'datetime' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => e.title || 'Refroidissement',
        secondary: (e) => (e.meta?.duree_min ? `${e.meta.duree_min} min` : ''),
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} °C` : ''),
    },
    {
        key: 'remise-temperature', register: 'REMISE_TEMP', group: 'TEMP', scheduling: 'event',
        title: 'Remise en température', short: 'Remise en T°', icon: 'flame', accent: 'blue',
        intro: 'Une remise en température doit atteindre +63 °C à cœur en moins d’une heure.',
        autoStatus: 'remise',
        fields: [
            { name: 'title', label: 'Préparation', type: 'text', required: true, autofocus: true, placeholder: 'Lasagnes' },
            { name: 'value_num', label: 'Température atteinte à cœur', type: 'number', unit: '°C', step: '0.1', required: true, help: 'Objectif : ≥ 63 °C.' },
            { name: 'occurred_at', label: 'Date et heure', type: 'datetime' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => e.title || 'Remise en température',
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} °C` : ''),
    },
    {
        key: 'reception', register: 'RECEPTION', group: 'TRACA', scheduling: 'event',
        title: 'Contrôle à réception', short: 'Réception', icon: 'cart', accent: 'amber',
        intro: 'À chaque livraison : fournisseur, DLC, température du produit, état de l’emballage. Les DLC remontent en alerte pour limiter le gaspillage.',
        fields: [
            { name: 'title', label: 'Produit livré', type: 'preset', preset: 'PRODUCT', required: true, autofocus: true, placeholder: 'Mozzarella fior di latte' },
            { name: 'meta:supplier', label: 'Fournisseur', type: 'preset', preset: 'SUPPLIER', placeholder: 'Metro, Transgourmet…' },
            { name: 'value_num', label: 'Température à réception', type: 'number', unit: '°C', step: '0.1', optional: true, help: 'Contrôle de la chaîne du froid à la livraison.' },
            { name: 'due_at', label: 'DLC / DLUO', type: 'date', help: 'Remonte en alerte à l’approche de la date.' },
            { name: 'meta:lot', label: 'N° de lot', type: 'text', optional: true },
            { name: 'status', label: 'Conformité', type: 'select', options: [['CONFORME', 'Conforme'], ['NON_CONFORME', 'Non conforme']], default: 'CONFORME' },
            { name: 'corrective', label: 'Action si non conforme', type: 'textarea', optional: true, showIf: (v) => v.status === 'NON_CONFORME' },
        ],
        primary: (e) => e.title || 'Livraison',
        secondary: (e) => e.meta?.supplier || '',
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} °C` : ''),
        badge: (e) => (e.due_at ? `DLC ${fmtDate(e.due_at)}` : ''),
    },
    {
        key: 'nettoyage', register: 'CLEANING', group: 'HYGIENE', scheduling: 'scheduled', deadlineHour: 22, batchMode: 'cleaning',
        title: 'Plan de nettoyage', short: 'Nettoyage', icon: 'spray-can', accent: 'teal',
        intro: 'Votre plan de nettoyage-désinfection par zone. On coche la tâche faite : qui, quand. La preuve se construit toute seule.',
        needsTask: true, fixedStatus: 'FAIT',
        fields: [
            { name: 'task_id', label: 'Tâche réalisée', type: 'task', required: true },
            { name: 'occurred_at', label: 'Date et heure', type: 'datetime' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => e.task_label || 'Nettoyage',
        secondary: (e) => e.task_zone || '',
    },
    {
        key: 'etiquettes', register: 'LABEL', group: 'TRACA', scheduling: 'event',
        title: 'Étiquettes & traçabilité', short: 'Étiquettes', icon: 'file-text', accent: 'violet',
        intro: 'Étiquette de DLC secondaire pour tout produit ouvert, décongelé ou fabriqué. Traçabilité du lot. Imprimable au format étiquette.',
        printable: true,
        fields: [
            { name: 'title', label: 'Produit', type: 'preset', preset: 'PRODUCT', autofillDlc: true, required: true, autofocus: true, placeholder: 'Sauce tomate maison' },
            { name: 'meta:type', label: 'Nature', type: 'select', options: [['OUVERTURE', 'Ouverture'], ['DECONGELATION', 'Décongélation'], ['FABRICATION', 'Fabrication']], default: 'FABRICATION' },
            { name: 'occurred_at', label: 'Date de fabrication / ouverture', type: 'datetime' },
            { name: 'due_at', label: 'À consommer avant le (DLC secondaire)', type: 'date', required: true },
            { name: 'meta:lot', label: 'N° de lot', type: 'text', optional: true },
        ],
        primary: (e) => e.title || 'Étiquette',
        secondary: (e) => labelNature(e.meta?.type),
        badge: (e) => (e.due_at ? `DLC ${fmtDate(e.due_at)}` : ''),
    },
    {
        key: 'huiles', register: 'OIL', group: 'HYGIENE', scheduling: 'event',
        title: 'Huiles de friture', short: 'Huiles', icon: 'droplet', accent: 'gold',
        intro: 'Contrôle de l’huile : aspect et composés polaires. Au-delà de 25 % de composés polaires, l’huile doit être changée.',
        needsEquipment: true, equipmentTypes: ['FRITEUSE'], autoStatus: 'oil',
        fields: [
            { name: 'equipment_id', label: 'Friteuse', type: 'equipment', required: true },
            { name: 'value_num', label: 'Composés polaires', type: 'number', unit: '%', step: '1', optional: true, help: 'Seuil réglementaire : ≤ 25 %.' },
            { name: 'meta:aspect', label: 'Aspect', type: 'select', options: [['CLAIR', 'Clair'], ['FONCE', 'Foncé'], ['MOUSSE', 'Mousse / fumée']], default: 'CLAIR' },
            { name: 'meta:change', label: 'Huile changée aujourd’hui', type: 'checkbox' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => e.equipment_name || 'Friteuse',
        secondary: (e) => (e.meta?.change ? 'Huile changée' : ''),
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} %` : ''),
    },
    {
        key: 'non-conformites', register: 'NONCONF', group: 'HYGIENE', scheduling: 'event',
        title: 'Non-conformités', short: 'Non-conf.', icon: 'alert-triangle', accent: 'rosso',
        intro: 'Le cœur de la méthode HACCP : un écart constaté → sa cause → l’action corrective → la vérification. Rien ne se perd.',
        fields: [
            { name: 'title', label: 'Constat', type: 'text', required: true, autofocus: true, placeholder: 'Chambre froide à +9 °C ce matin' },
            { name: 'meta:categorie', label: 'Catégorie', type: 'select', options: [['TEMPERATURE', 'Température'], ['LIVRAISON', 'Livraison'], ['NETTOYAGE', 'Nettoyage'], ['NUISIBLES', 'Nuisibles'], ['AUTRE', 'Autre']], default: 'TEMPERATURE' },
            { name: 'corrective', label: 'Action corrective', type: 'textarea', placeholder: 'Produits déclassés, réglage revu, contrôle à 14 h' },
            { name: 'status', label: 'Suivi', type: 'select', options: [['OUVERT', 'Ouverte'], ['RESOLU', 'Résolue']], default: 'OUVERT' },
            { name: 'occurred_at', label: 'Date et heure', type: 'datetime' },
        ],
        primary: (e) => e.title || 'Non-conformité',
        secondary: (e) => ncCategorie(e.meta?.categorie),
    },
    {
        key: 'biodechets', register: 'BIOWASTE', group: 'HYGIENE', scheduling: 'event',
        title: 'Registre biodéchets', short: 'Biodéchets', icon: 'trash', accent: 'green',
        intro: 'Tri à la source obligatoire depuis le 1ᵉʳ janvier 2024. Pesez et enregistrez vos biodéchets et leur destination.',
        fields: [
            { name: 'meta:type_dechet', label: 'Type de déchet', type: 'select', options: [['EPLUCHURES', 'Épluchures / parures'], ['INVENDUS', 'Invendus / restes'], ['HUILE', 'Huile usagée'], ['AUTRE', 'Autre']], default: 'EPLUCHURES' },
            { name: 'value_num', label: 'Poids', type: 'number', unit: 'kg', step: '0.1', required: true, autofocus: true },
            { name: 'meta:destination', label: 'Destination', type: 'select', options: [['COMPOST', 'Compostage'], ['COLLECTE', 'Collecte dédiée'], ['METHANISATION', 'Méthanisation'], ['AUTRE', 'Autre']], default: 'COLLECTE' },
            { name: 'occurred_at', label: 'Date', type: 'datetime' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
        ],
        primary: (e) => bioType(e.meta?.type_dechet),
        secondary: (e) => bioDest(e.meta?.destination),
        value: (e) => (e.value_num != null ? `${fmtNum(e.value_num)} kg` : ''),
    },
    {
        key: 'equipements', register: 'EQUIPMENT', group: 'HYGIENE', scheduling: 'event',
        title: 'Carnet d’équipement', short: 'Équipements', icon: 'settings', accent: 'navy',
        intro: 'Fiche de vie du matériel : maintenance, pannes — et programmation de cuisson de nuit du four. La mémoire de vos équipements.',
        needsEquipment: true,
        fields: [
            { name: 'equipment_id', label: 'Équipement', type: 'equipment', required: true },
            { name: 'meta:intervention', label: 'Type', type: 'select', options: [['MAINTENANCE', 'Maintenance / entretien'], ['PANNE', 'Panne / réparation'], ['PROG_NUIT', 'Programmation de nuit'], ['CONTROLE', 'Contrôle périodique']], default: 'MAINTENANCE' },
            { name: 'title', label: 'Objet', type: 'text', required: true, placeholder: 'Départ cuisson 4 h — 250 °C — 3 h' },
            { name: 'meta:prog', label: 'Détails programmation', type: 'textarea', optional: true, help: 'Heure de départ, température, durée — pour la programmation de nuit.', showIf: (v) => v['meta:intervention'] === 'PROG_NUIT' },
            { name: 'note', label: 'Remarque', type: 'textarea', optional: true },
            { name: 'occurred_at', label: 'Date', type: 'datetime' },
        ],
        primary: (e) => e.equipment_name || 'Équipement',
        secondary: (e) => `${interventionLabel(e.meta?.intervention)}${e.title ? ' · ' + e.title : ''}`,
    },
    {
        key: 'audits', register: 'AUDIT', group: 'HYGIENE', scheduling: 'event',
        title: 'Audits & auto-contrôles', short: 'Audits', icon: 'clipboard-check', accent: 'green',
        intro: 'Vos auto-contrôles d’hygiène et les visites : constats, conformité, actions correctives.',
        fields: [
            { name: 'title', label: 'Objet de l’audit', type: 'text', required: true, autofocus: true, placeholder: 'Auto-contrôle hebdomadaire du labo' },
            { name: 'meta:type', label: 'Type', type: 'select', options: [['AUTO', 'Auto-contrôle'], ['INTERNE', 'Visite interne'], ['EXTERNE', 'Contrôle externe']], default: 'AUTO' },
            { name: 'status', label: 'Résultat', type: 'select', options: [['CONFORME', 'Conforme'], ['A_VERIFIER', 'À vérifier'], ['NON_CONFORME', 'Non conforme']], default: 'CONFORME' },
            { name: 'note', label: 'Constats', type: 'textarea', optional: true, placeholder: 'Points observés' },
            { name: 'corrective', label: 'Actions correctives', type: 'textarea', optional: true },
            { name: 'occurred_at', label: 'Date', type: 'datetime' },
        ],
        primary: (e) => e.title || 'Audit',
        secondary: (e) => auditType(e.meta?.type),
    },
];

export const registerByKey = (key) => REGISTERS.find((r) => r.key === key) || null;
export const registerByEnum = (en) => REGISTERS.find((r) => r.register === en) || null;
export const registersOfGroup = (g) => REGISTERS.filter((r) => r.group === g);

// Badge « système d'attente » d'une tuile, façon e-pack / Kooklin : à faire + échéance, en retard,
// à jour, ou activité du jour. `stat` = summary.byRegister[reg], `summary` = le résumé complet.
//   tone : wait (à faire) · bad (en retard / ouvert) · ok (à jour) · done (activité) · idle (rien)
export function tileBadge(cfg, stat = {}, summary = {}, now = new Date()) {
    const today = stat.today || 0;
    if (cfg.register === 'NONCONF') {
        const open = summary.openNonConf || 0;
        return open > 0 ? { tone: 'bad', top: open > 1 ? 'ouvertes' : 'ouverte', count: open }
                        : { tone: 'ok', top: 'à jour', check: true };
    }
    if (cfg.scheduling === 'scheduled') {
        if ((stat.expected || 0) === 0) return { tone: 'idle', top: 'à régler' };
        const pending = stat.pending || 0;
        if (pending === 0) return { tone: 'ok', top: 'à jour', check: true };
        const overdue = now.getHours() >= (cfg.deadlineHour || 23);
        return { tone: overdue ? 'bad' : 'wait', top: overdue ? 'en retard' : `avant ${cfg.deadlineHour}h`, count: pending };
    }
    // Événementiel : on montre l'activité du jour (comme « Enreg. 2 », « Impr. 5 »).
    return today > 0 ? { tone: 'done', top: "auj.", count: today } : { tone: 'idle', top: '' };
}

// ── Petits formateurs (purs) ──────────────────────────────────────────────────────────────────
export function fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n ?? '');
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}
export function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
export function fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
        dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const labelNature = (t) => ({ OUVERTURE: 'Ouverture', DECONGELATION: 'Décongélation', FABRICATION: 'Fabrication' }[t] || '');
const ncCategorie = (t) => ({ TEMPERATURE: 'Température', LIVRAISON: 'Livraison', NETTOYAGE: 'Nettoyage', NUISIBLES: 'Nuisibles', AUTRE: 'Autre' }[t] || '');
const bioType = (t) => ({ EPLUCHURES: 'Épluchures / parures', INVENDUS: 'Invendus / restes', HUILE: 'Huile usagée', AUTRE: 'Autre' }[t] || 'Biodéchet');
const bioDest = (t) => ({ COMPOST: 'Compostage', COLLECTE: 'Collecte dédiée', METHANISATION: 'Méthanisation', AUTRE: 'Autre' }[t] || '');
const interventionLabel = (t) => ({ MAINTENANCE: 'Maintenance', PANNE: 'Panne', PROG_NUIT: 'Programmation de nuit', CONTROLE: 'Contrôle' }[t] || 'Intervention');
const auditType = (t) => ({ AUTO: 'Auto-contrôle', INTERNE: 'Visite interne', EXTERNE: 'Contrôle externe' }[t] || 'Audit');

// Seuils des process de température (refroidissement / remise en température).
export const REFROID_TEMP_MAX = 10;    // °C à cœur en fin de refroidissement
export const REFROID_DUREE_MAX = 120;  // minutes
export const REMISE_TEMP_MIN = 63;     // °C à cœur

// Conformité d'un refroidissement / d'une remise en température (pour l'aperçu et le statut auto).
export function refroidStatus(value, dureeMin) {
    if (value === '' || value == null) return null;
    const v = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(v)) return null;
    const d = dureeMin === '' || dureeMin == null ? null : Number(String(dureeMin).replace(',', '.'));
    if (v > REFROID_TEMP_MAX) return 'NON_CONFORME';
    if (d != null && Number.isFinite(d) && d > REFROID_DUREE_MAX) return 'NON_CONFORME';
    return 'CONFORME';
}
export function remiseStatus(value) {
    if (value === '' || value == null) return null;
    const v = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(v)) return null;
    return v >= REMISE_TEMP_MIN ? 'CONFORME' : 'NON_CONFORME';
}
