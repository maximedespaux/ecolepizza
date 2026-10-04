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
 * RÉPARTIT, par jour, les stagiaires connectés ENTRE LEURS FORMATIONS, de façon PONDÉRÉE : un
 * stagiaire inscrit à k formations compte 1/k dans CHACUNE (demandé le 2026-10-04 : « niv1 niv2 →
 * 50 % / 50 % »). Ainsi la somme des parts d'un jour = le nombre de stagiaires DISTINCTS connectés
 * ce jour-là : les segments colorés remplissent EXACTEMENT la part stagiaire de la barre, chacun à
 * la couleur de sa formation. Un stagiaire connecté SANS formation tombe dans « Sans formation ».
 *
 * @param rows               [{ jour, uid, key, label }] — une ligne par (jour, stagiaire, formation)
 * @param stagiairesParJour  Map(jour → nombre de stagiaires DISTINCTS connectés) — pour « Sans formation »
 * @returns { parJour: Map(jour → [{ key, label, n }] triées), cles: [{ key, label }] } — `cles` =
 *          l'ordre GLOBAL des formations (du plus présent au moins présent), pour couleurs + légende.
 */
function pondererFormations(rows, stagiairesParJour) {
    const parUser = new Map(); // jour → Map(uid → Set(key))
    const labelDe = new Map();
    for (const r of rows || []) {
        if (r.key == null || r.key === '') continue;
        const key = String(r.key);
        if (!parUser.has(r.jour)) parUser.set(r.jour, new Map());
        const u = parUser.get(r.jour);
        if (!u.has(r.uid)) u.set(r.uid, new Set());
        u.get(r.uid).add(key);
        labelDe.set(key, r.label || key);
    }
    const jours = new Set([...(stagiairesParJour ? stagiairesParJour.keys() : []), ...parUser.keys()]);
    const out = new Map();
    const totalParCle = new Map();
    for (const jour of jours) {
        const users = parUser.get(jour) || new Map();
        const tally = new Map();
        for (const set of users.values()) {
            const k = set.size || 1;
            for (const key of set) tally.set(key, (tally.get(key) || 0) + 1 / k);
        }
        const totalStag = Number((stagiairesParJour && stagiairesParJour.get(jour)) || 0);
        const autre = Math.max(0, totalStag - users.size); // connectés sans aucune formation
        const liste = [...tally.entries()].map(([key, n]) => ({ key, label: labelDe.get(key), n }));
        if (autre > 1e-6) liste.push({ key: '__autre', label: 'Sans formation', n: autre });
        if (!liste.length) continue; // jour sans stagiaire connecté
        for (const f of liste) totalParCle.set(f.key, (totalParCle.get(f.key) || 0) + f.n);
        out.set(jour, liste);
    }
    // Ordre global : du plus présent au moins présent ; « Sans formation » toujours en dernier.
    const ordre = [...totalParCle.keys()].filter((k) => k !== '__autre')
        .sort((a, b) => totalParCle.get(b) - totalParCle.get(a) || String(labelDe.get(a)).localeCompare(String(labelDe.get(b)), 'fr'));
    const cles = ordre.map((k) => ({ key: k, label: labelDe.get(k) || k }));
    if (totalParCle.has('__autre')) cles.push({ key: '__autre', label: 'Sans formation' });
    const rang = new Map(cles.map((c, i) => [c.key, i]));
    for (const liste of out.values()) liste.sort((a, b) => (rang.get(a.key) ?? 99) - (rang.get(b.key) ?? 99));
    return { parJour: out, cles };
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

module.exports = { TRANCHES, FENETRES, trancheDe, repartition, connectesDepuis, fenetreJours, densifier, pondererFormations, relancer };
