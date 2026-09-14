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


/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * VALIDATION PAR COMPÉTENCE — la règle du jury, qui n'est pas un total de points.
 *
 * SUR LA GRILLE PAPIER DE L'ÉCOLE, chaque bloc porte sa règle en toutes lettres : « le candidat
 * doit valider les 6 critères », « au moins 5 critères sur 6, le critère C2.3 est obligatoire ».
 * UN TOTAL NE SAIT PAS DIRE CELA : cinq critères sur six, et cinq sur six DONT LE BON, font cinq
 * points l'un comme l'autre — et pourtant l'un valide la compétence et l'autre non.
 *
 * C'est pour cette seule raison que la compétence existe comme niveau à part, et non comme une
 * façon d'afficher des exercices par paquets.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Un critère est-il ACQUIS ? Un critère vaut 1 point : acquis, ou pas. */
const critereAcquis = (points) => entier(points) === 1;

/**
 * Validation d'UNE compétence.
 * @param comp     { min_valides }  `min_valides` null = TOUS les critères
 * @param criteres exercices ACTIFS de la compétence, chacun { id, obligatoire }
 * @param notes    { [exercice_id]: points }
 * @returns { valides, total, requis, manquants, obligatoiresManques, notes: n, complet, validee }
 *
 * `validee` VAUT `null` TANT QUE TOUT N'EST PAS COCHÉ, et pas `false`. Une compétence dont il
 * reste un critère à voir n'est pas refusée, elle n'est pas finie — sauf quand le résultat est
 * DÉJÀ joué : un critère obligatoire manqué, ou trop de critères ratés pour que le seuil reste
 * atteignable. Prononcer l'échec avant d'avoir tout vu serait faux ; le prononcer quand il est
 * arithmétiquement acquis est simplement exact.
 */
function validationCompetence(comp, criteres, notes) {
    const actifs = (criteres || []).filter((c) => c && c.active !== 0 && c.active !== false);
    const total = actifs.length;
    /* `min_valides` absent = tous. C'est la règle la plus fréquente sur la grille de l'école, et
       la seule qui reste juste quand on ajoute un critère : un 6 écrit en dur deviendrait faux
       en silence au septième. */
    const brut = entier(comp && comp.min_valides);
    const requis = brut === null ? total : Math.min(Math.max(brut, 0), total);

    let valides = 0;
    let rates = 0;
    let n = 0;
    const obligatoiresManques = [];
    for (const c of actifs) {
        const p = notes ? notes[c.id] : undefined;
        if (p === null || p === undefined) continue;
        n += 1;
        if (critereAcquis(p)) valides += 1;
        else {
            rates += 1;
            if (c.obligatoire) obligatoiresManques.push(c.id);
        }
    }
    const complet = total > 0 && n === total;
    /* Les critères obligatoires NON ENCORE VUS ne sont pas des manques : on les distingue, sinon
       une compétence à peine commencée s'annoncerait perdue. */
    const seuilInatteignable = total - rates < requis;
    const echecAcquis = obligatoiresManques.length > 0 || seuilInatteignable;

    let validee;
    if (echecAcquis) validee = false;
    else if (!complet) validee = null;
    else validee = valides >= requis;

    return {
        valides, total, requis, notes: n, complet,
        manquants: Math.max(0, requis - valides),
        obligatoiresManques, validee,
    };
}

/**
 * Résultat d'un candidat sur une grille de jury.
 * @param competences [{ ...comp, criteres: [...] }]
 * @param notes       { [exercice_id]: points }
 * @returns { validees, total, complet, details: Map code→validation }
 *
 * On compte les compétences VALIDÉES, pas les critères : c'est le « Nombre de compétences
 * validées : /7 » du pied de grille, et c'est sur lui que le jury donne son avis.
 */
function resultatJury(competences, notes) {
    const actives = (competences || []).filter((c) => c && c.active !== 0 && c.active !== false);
    const details = [];
    let validees = 0;
    let complet = actives.length > 0;
    for (const comp of actives) {
        const v = validationCompetence(comp, comp.criteres, notes);
        details.push({ ...v, id: comp.id, code: comp.code, label: comp.label });
        if (v.validee === true) validees += 1;
        if (v.validee === null) complet = false;
    }
    return { validees, total: actives.length, complet, details };
}

module.exports = { BAREMES, lirePaliers, maximumExercice, pointsPour, dureeLisible, totalGrille, reussite, critereAcquis, validationCompetence, resultatJury };
