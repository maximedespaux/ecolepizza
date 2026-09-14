/**
 * BARÈMES D'ÉVALUATION PRATIQUE — convertir une mesure brute en points.
 *
 * LE FORMATEUR SAISIT CE QU'IL OBSERVE, pas des points : un chronomètre, un geste réussi ou
 * non, une appréciation. C'est ici qu'on traduit. Quatre familles coexistent dans une même
 * grille, parce qu'on ne note pas un temps de façonnage comme on valide un geste d'hygiène.
 *
 * FICHIER PUR, SANS BASE NI REQUÊTE, et c'est délibéré : la conversion est la seule partie de
 * cette fonctionnalité qui puisse se tromper en silence. Un palier mal choisi ne lève aucune
 * erreur — il donne 50 points au lieu de 100, et personne ne le voit avant qu'un stagiaire
 * conteste sa note. On l'éprouve donc seule, cas par cas.
 *
 * LES POINTS SONT FIGÉS À LA SAISIE par l'appelant (cf. migration 148). Cette fonction ne dit
 * que « voilà ce que vaut cette mesure AUJOURD'HUI » ; c'est le contrôleur qui décide d'écrire
 * le résultat, et qui ne le réécrit jamais après coup.
 */

const BAREMES = ['POINTS', 'TEMPS', 'BINAIRE', 'NIVEAUX'];

/** Paliers d'un exercice, tolérants au stockage : JSON en texte, tableau déjà décodé, ou rien. */
function lirePaliers(brut) {
    if (Array.isArray(brut)) return brut;
    if (typeof brut === 'string' && brut.trim()) {
        try {
            const v = JSON.parse(brut);
            return Array.isArray(v) ? v : [];
        } catch { return []; }
    }
    return [];
}

/* `Number(null)` VAUT ZÉRO, et `Number('')` aussi. Sans les écarter explicitement, un seuil de
   réussite absent devenait un seuil de zéro — et tout le monde réussissait, sans qu'aucune
   erreur ne soit levée. Un booléen est écarté pour la même raison : `Number(false)` vaut 0. */
const entier = (v) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * Points maximum réellement atteignables sur un exercice.
 *
 * POURQUOI LE RECALCULER plutôt que se fier à `max_points`. Sur un barème à paliers, le maximum
 * EST le meilleur palier : laisser les deux diverger ferait afficher un total sur 120 quand nul
 * ne peut dépasser 100, et le seuil de réussite porterait sur un maximum imaginaire.
 */
function maximumExercice(ex) {
    const declare = Math.max(0, entier(ex && ex.max_points) ?? 0);
    const bareme = (ex && ex.bareme) || 'POINTS';
    if (bareme === 'TEMPS' || bareme === 'NIVEAUX') {
        const paliers = lirePaliers(ex && ex.paliers);
        if (!paliers.length) return declare;
        return paliers.reduce((m, p) => Math.max(m, entier(p && p.points) ?? 0), 0);
    }
    return declare;
}

/**
 * Convertit une mesure brute en points, pour UN exercice.
 * @returns {{points:number|null, libelle:string}} `points: null` = non noté (et non « zéro »).
 *
 * NON NOTÉ N'EST PAS ZÉRO, et la distinction porte tout : un exercice qu'un stagiaire n'a pas
 * encore passé ne doit pas peser dans son total comme un échec. Une valeur absente rend donc
 * `null`, que le total ignore — alors qu'un zéro délibéré, lui, compte.
 */
function pointsPour(ex, valeur) {
    const bareme = (ex && ex.bareme) || 'POINTS';
    const vide = valeur === null || valeur === undefined || String(valeur).trim() === '';
    if (vide) return { points: null, libelle: 'Non noté' };

    const max = maximumExercice(ex);

    if (bareme === 'BINAIRE') {
        /* On accepte ce que les écrans et les imports envoient réellement : une case cochée
           (`true`), un « 1 », un « OUI ». Tout le reste vaut non acquis — un barème binaire ne
           doit jamais rendre `null` sur une valeur présente, sinon l'exercice disparaîtrait du
           total au lieu de compter pour zéro. */
        const s = String(valeur).trim().toUpperCase();
        const acquis = valeur === true || s === 'OUI' || s === '1' || s === 'TRUE' || s === 'ACQUIS';
        return { points: acquis ? max : 0, libelle: acquis ? 'Acquis' : 'Non acquis' };
    }

    if (bareme === 'NIVEAUX') {
        const paliers = lirePaliers(ex && ex.paliers);
        /* La valeur est l'INDEX du niveau choisi, pas son libellé : renommer « Acquis » en
           « Maîtrisé » ne doit pas effacer les notes déjà saisies. */
        const i = entier(valeur);
        const p = i !== null && i >= 0 && i < paliers.length ? paliers[i] : null;
        if (!p) return { points: null, libelle: 'Non noté' };
        return { points: Math.max(0, entier(p.points) ?? 0), libelle: String(p.label || `Niveau ${i + 1}`) };
    }

    if (bareme === 'TEMPS') {
        const secondes = entier(valeur);
        if (secondes === null || secondes < 0) return { points: null, libelle: 'Non noté' };
        const paliers = lirePaliers(ex && ex.paliers);
        /* LES PALIERS SONT TRIÉS ICI, pas supposés triés. Ils sont saisis à la main dans un
           écran : une ligne ajoutée après coup se retrouverait au mauvais endroit, et le
           premier palier rencontré gagnerait à tort. `max_s: null` (ou absent) signifie « au
           delà de tout le reste » et part donc en dernier. */
        const tries = [...paliers].sort((a, b) => {
            const ma = entier(a && a.max_s);
            const mb = entier(b && b.max_s);
            if (ma === null) return 1;
            if (mb === null) return -1;
            return ma - mb;
        });
        for (const p of tries) {
            const borne = entier(p && p.max_s);
            if (borne === null || secondes <= borne) {
                return { points: Math.max(0, entier(p.points) ?? 0), libelle: dureeLisible(secondes) };
            }
        }
        /* Aucun palier ne couvre cette durée : zéro, pas « non noté ». Le formateur a bien
           mesuré quelque chose, et une grille dont le dernier palier est borné doit pouvoir
           dire « au-delà, rien ». */
        return { points: 0, libelle: dureeLisible(secondes) };
    }

    // POINTS : saisie directe, bornée par le maximum de l'exercice.
    const n = entier(valeur);
    if (n === null) return { points: null, libelle: 'Non noté' };
    /* BORNÉ DES DEUX CÔTÉS. Une saisie négative viendrait d'une faute de frappe, et une saisie
       au-dessus du maximum ferait dépasser 100 % le total de la grille — un pourcentage de
       réussite supérieur à cent se remarque, mais après coup. */
    const points = Math.min(Math.max(n, 0), max);
    return { points, libelle: `${points} / ${max}` };
}

/** « 1 min 12 s » — une durée se lit, elle ne se compte pas en secondes. */
function dureeLisible(secondes) {
    const s = Math.max(0, entier(secondes) ?? 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (!m) return `${r} s`;
    return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`;
}

/**
 * Total d'un dossier sur une grille.
 * @param exercices liste des exercices ACTIFS de la grille
 * @param notes     { [exercice_id]: points } — les points FIGÉS en base
 * @returns { points, max, percent, notes: n, total: N, complet }
 *
 * LE MAXIMUM NE COMPTE QUE LES EXERCICES NOTÉS. Rapporter un total partiel au maximum de toute
 * la grille afficherait 20 % à qui a tout réussi sur le premier tiers du stage — et le seuil de
 * réussite refuserait quelqu'un qui n'a simplement pas fini. `complet` dit si tout est noté ;
 * c'est à l'appelant de décider s'il applique le seuil avant cela.
 */
function totalGrille(exercices, notes) {
    const actifs = (exercices || []).filter((e) => e && e.active !== 0 && e.active !== false);
    let points = 0;
    let max = 0;
    let n = 0;
    for (const ex of actifs) {
        const p = notes ? notes[ex.id] : undefined;
        if (p === null || p === undefined) continue;
        points += Math.max(0, entier(p) ?? 0);
        max += maximumExercice(ex);
        n += 1;
    }
    return {
        points,
        max,
        percent: max > 0 ? Math.round((points / max) * 100) : 0,
        notes: n,
        total: actifs.length,
        complet: actifs.length > 0 && n === actifs.length,
    };
}

/** Le dossier atteint-il le seuil ? `null` quand la grille n'en fixe aucun. */
function reussite(grille, totaux) {
    const seuil = entier(grille && grille.pass_score);
    if (seuil === null) return null;
    /* TANT QUE TOUT N'EST PAS NOTÉ, on ne prononce pas l'échec : un stagiaire à mi-parcours
       n'a pas échoué, il n'a pas fini. On peut en revanche annoncer la réussite dès qu'elle est
       acquise — ce qui arrive quand le total déjà obtenu suffit. */
    if (!totaux.complet && totaux.percent < seuil) return null;
    return totaux.percent >= seuil;
}

module.exports = { BAREMES, lirePaliers, maximumExercice, pointsPour, dureeLisible, totalGrille, reussite };
