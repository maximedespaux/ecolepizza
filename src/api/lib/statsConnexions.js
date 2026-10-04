/* STATISTIQUES DE CONNEXION — règles PURES (tranches de récence, fenêtre de jours), éprouvées sans
 * base. Deux vues : la RÉCENCE (depuis la dernière connexion de chaque compte, `user.last_login_at`)
 * et les CONNEXIONS PAR JOUR sur une fenêtre (table `connexion_jour`, migration 200).
 */

// Les tranches de récence, de la plus fraîche à « jamais » — DISJOINTES et EXHAUSTIVES.
const TRANCHES = [
    { cle: 'j1', libelle: "Aujourd'hui" },
    { cle: 'j7', libelle: '7 derniers jours' },
    { cle: 'j30', libelle: '30 derniers jours' },
    { cle: 'j90', libelle: '90 derniers jours' },
    { cle: 'vieux', libelle: 'Plus ancien' },
    { cle: 'jamais', libelle: 'Jamais connecté' },
];

const JOUR_MS = 24 * 60 * 60 * 1000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** La tranche d'un compte d'après sa dernière connexion (Date|string|null) et le moment présent. */
function trancheDe(lastLogin, maintenant) {
    if (!lastLogin) return 'jamais';
    const jours = (maintenant.getTime() - new Date(lastLogin).getTime()) / JOUR_MS;
    if (jours < 1) return 'j1';
    if (jours < 7) return 'j7';
    if (jours < 30) return 'j30';
    if (jours < 90) return 'j90';
    return 'vieux';
}

/** Répartit une liste de comptes [{ last_login_at }] en tranches → { j1, j7, …, jamais }. */
function repartition(comptes, maintenant = new Date()) {
    const out = Object.fromEntries(TRANCHES.map((t) => [t.cle, 0]));
    for (const c of comptes || []) out[trancheDe(c.last_login_at, maintenant)]++;
    return out;
}

/** Combien de comptes connectés dans les N derniers jours (récence < n). */
function connectesDepuis(comptes, n, maintenant = new Date()) {
    const borne = maintenant.getTime() - n * JOUR_MS;
    return (comptes || []).filter((c) => c.last_login_at && new Date(c.last_login_at).getTime() >= borne).length;
}

/** Les `jours` derniers jours en AAAA-MM-JJ (du plus ancien à aujourd'hui), pour une courbe dense. */
function fenetreJours(jours, maintenant = new Date()) {
    const out = [];
    for (let i = jours - 1; i >= 0; i--) out.push(ymd(new Date(maintenant.getTime() - i * JOUR_MS)));
    return out;
}

/** Densifie des lignes [{ jour, stagiaires, equipe }] sur la fenêtre, en comblant les jours vides. */
function densifier(lignes, jours, maintenant = new Date()) {
    const parJour = new Map((lignes || []).map((l) => [l.jour, l]));
    return fenetreJours(jours, maintenant).map((jour) => ({
        jour,
        stagiaires: Number(parJour.get(jour)?.stagiaires || 0),
        equipe: Number(parJour.get(jour)?.equipe || 0),
    }));
}

// Fenêtres proposées à l'écran (le sélecteur 7 / 14 / 30 jours) ; la première est le défaut.
const FENETRES = [7, 14, 30];

/**
 * Regroupe les lignes [{ jour, label, n }] (stagiaires connectés PAR FORMATION et par jour) en
 * Map(jour → [{ label, n }]) triée du plus grand au plus petit. Les formations à 0 ne figurent pas
 * (demandé : « si 0 don't display ») — et comme la requête les exclut déjà, il n'y a rien à filtrer.
 */
function grouperFormations(rows) {
    const m = new Map();
    for (const r of rows || []) {
        const n = Number(r.n) || 0;
        if (n <= 0 || !r.label) continue;
        if (!m.has(r.jour)) m.set(r.jour, []);
        m.get(r.jour).push({ label: String(r.label), n });
    }
    for (const list of m.values()) list.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr'));
    return m;
}

/**
 * Les comptes À RELANCER d'après leur récence : JAMAIS connectés, et plus de 30 jours sans connexion
 * (tranches `j90` 30-90 j et `vieux` > 90 j). Rend deux listes de NOMS, triées. Sert à l'école pour
 * relancer les stagiaires inactifs (suivi Qualiopi).
 */
function relancer(comptes, maintenant = new Date()) {
    const jamais = []; const anciens = [];
    for (const c of comptes || []) {
        const t = trancheDe(c.last_login_at, maintenant);
        if (t === 'jamais') jamais.push(c.nom);
        else if (t === 'j90' || t === 'vieux') anciens.push(c.nom); // > 30 jours sans connexion
    }
    const triFr = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr');
    return { jamais: jamais.sort(triFr), anciens: anciens.sort(triFr) };
}

module.exports = { TRANCHES, FENETRES, trancheDe, repartition, connectesDepuis, fenetreJours, densifier, grouperFormations, relancer };
