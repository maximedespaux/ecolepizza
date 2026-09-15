/**
 * PIZZA QUEST EST-IL UTILISÉ ? — le bilan d'usage, déduit de ce qui est déjà enregistré.
 *
 * CE QUE LA BASE GARDE, ET CE QU'ELLE NE GARDE PAS. `learner_quest_progress` tient UNE ligne
 * par (stagiaire, monde, rang de chapitre) avec ses étoiles. Les réponses, elles, ne sont
 * enregistrées NULLE PART : ni la question posée, ni le juste/faux, ni une partie abandonnée.
 * Le nombre de questions répondues ne peut donc qu'être DÉDUIT — un chapitre terminé vaut ses
 * questions jouables.
 *
 * C'EST UNE ESTIMATION BASSE, et il faut le dire à l'écran plutôt que de laisser croire à un
 * compte exact : un stagiaire qui répond à quatre questions sur sept et s'arrête compte pour
 * zéro, et les reprises comme les erreurs restent invisibles. Pour le compte exact il faudrait
 * enregistrer chaque réponse — un autre chantier, qui ne commencerait à compter qu'au jour de
 * son déploiement, sans rien dire du passé. Celui-ci lit tout l'historique.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DU RANG. `step` n'est PAS l'identifiant d'un chapitre : c'est sa POSITION (à partir
 * de 0) dans la liste JOUABLE de la formation — celle que `buildChapters` assemble, triée par
 * `sort_order` ET PURGÉE des chapitres sans question exploitable. Compter avec un simple
 * `ORDER BY sort_order` tomberait donc à côté dès qu'un chapitre est vide ou inactif, et
 * attribuerait des parties au mauvais chapitre. On passe par le même montage que le jeu.
 *
 * DEUX NATURES DE LIGNES DANS LA MÊME TABLE. `world` vaut soit le CODE d'une formation
 * (progression de chapitre), soit la clé d'un MINI-JEU (« constructeur », « pate »…), toujours
 * au rang 0. Les mini-jeux ne sont pas des chapitres — les mêler fausserait « chapitres
 * terminés » — mais ils SONT de l'usage, et se comptent à part.
 *
 * ET LES LIGNES ORPHELINES. Une progression dont le monde ne correspond plus à aucune formation,
 * ou dont le rang dépasse la liste jouable d'aujourd'hui, ne se rattache à rien : la banque a
 * changé depuis. On les compte séparément au lieu de les jeter en silence — c'est le signe que
 * des parties jouées ne sont plus rattachables, et personne ne le saurait autrement.
 */
const { buildChapters } = require('./questcontent.js');
const { chapitreFait } = require('./cadresQuest.js');

/**
 * @param {object} p
 * @param {Array} p.programs  formations actives : { id, code, title }
 * @param {object} p.bank     sortie de `loadBank` : { chapters, questions, options, difficulties }
 * @param {Array} p.progress  lignes de `learner_quest_progress` : { learner_id, world, step, stars }
 * @param {number} [p.stagiaires] effectif total, pour situer le nombre de joueurs
 */
function usageQuest({ programs = [], bank = {}, progress = [], stagiaires = 0 }) {
    /* La liste JOUABLE par formation, montée exactement comme le jeu la monte. */
    const parProgramme = new Map();
    for (const p of programs) {
        const chapitres = buildChapters(
            (bank.chapters || []).filter((c) => c.active && c.program_id === p.id),
            (bank.questions || []).filter((q) => q.active),
            bank.options || [], bank.difficulties || []
        );
        parProgramme.set(p.code, { ...p, chapitres });
    }

    const parChapitre = new Map();   // id de chapitre -> compteurs
    const miniJeux = new Map();      // clé -> compteurs
    const joueurs = new Set();
    let chapitresTermines = 0, questionsParcourues = 0, etoiles = 0, parfaits = 0;
    let orphelines = 0;
    const joueursParFormation = new Map();

    for (const r of progress) {
        const n = Number(r.stars) || 0;
        joueurs.add(r.learner_id);
        const monde = parProgramme.get(r.world);

        if (!monde) {
            /* Pas une formation : mini-jeu, ou monde disparu. On ne tranche pas ici — la clé
               parle d'elle-même à l'écran, et inventer une liste de mini-jeux côté serveur
               ferait un second exemplaire de celle qui vit dans le jeu. */
            const m = miniJeux.get(r.world) || { cle: r.world, joueurs: new Set(), etoiles: 0 };
            m.joueurs.add(r.learner_id);
            m.etoiles += n;
            miniJeux.set(r.world, m);
            continue;
        }

        const rang = Number.parseInt(r.step, 10);
        const ch = Number.isInteger(rang) ? monde.chapitres[rang] : undefined;
        if (!ch) { orphelines++; continue; } // la banque a changé depuis cette partie

        if (!parChapitre.has(ch.id)) {
            parChapitre.set(ch.id, {
                id: ch.id, titre: ch.title, formation: monde.code, formation_titre: monde.title,
                questions: ch.questions.length, joueurs: 0, etoiles: 0, parfaits: 0,
            });
        }
        const c = parChapitre.get(ch.id);
        etoiles += n;
        if (!chapitreFait(n)) continue; // commencé sans être acquis : rien à compter

        chapitresTermines++;
        questionsParcourues += ch.questions.length;
        c.joueurs++; c.etoiles += n;
        if (n >= 3) { parfaits++; c.parfaits++; }
        const f = joueursParFormation.get(monde.code) || new Set();
        f.add(r.learner_id);
        joueursParFormation.set(monde.code, f);
    }

    const chapitresDisponibles = [...parProgramme.values()].reduce((s, m) => s + m.chapitres.length, 0);
    const questionsDisponibles = [...parProgramme.values()]
        .reduce((s, m) => s + m.chapitres.reduce((t, c) => t + c.questions.length, 0), 0);

    return {
        stagiaires,
        joueurs: joueurs.size,
        chapitresTermines,
        chapitresDisponibles,
        chapitresTouches: parChapitre.size,
        questionsParcourues,
        questionsDisponibles,
        etoiles,
        parfaits,
        orphelines,
        parFormation: [...parProgramme.values()].map((m) => {
            const siens = [...parChapitre.values()].filter((c) => c.formation === m.code);
            return {
                code: m.code, titre: m.title,
                chapitres: m.chapitres.length,
                questions: m.chapitres.reduce((t, c) => t + c.questions.length, 0),
                joueurs: (joueursParFormation.get(m.code) || new Set()).size,
                termines: siens.reduce((s, c) => s + c.joueurs, 0),
                questionsParcourues: siens.reduce((s, c) => s + c.joueurs * c.questions, 0),
            };
        }).sort((a, b) => b.questionsParcourues - a.questionsParcourues || a.code.localeCompare(b.code)),
        /* Les plus joués d'abord : c'est ce qui dit SUR QUOI le jeu sert, pas seulement s'il
           sert. Un chapitre jamais touché n'apparaît pas — il est déjà compté dans l'écart
           entre `chapitresTouches` et `chapitresDisponibles`. */
        chapitres: [...parChapitre.values()]
            .map((c) => ({ ...c, moyenneEtoiles: c.joueurs ? +(c.etoiles / c.joueurs).toFixed(2) : 0 }))
            .sort((a, b) => b.joueurs - a.joueurs || a.titre.localeCompare(b.titre)),
        miniJeux: [...miniJeux.values()]
            .map((m) => ({ cle: m.cle, joueurs: m.joueurs.size, etoiles: m.etoiles }))
            .sort((a, b) => b.joueurs - a.joueurs || a.cle.localeCompare(b.cle)),
    };
}

module.exports = { usageQuest };
