const db = require('../config/database.js');
const stats = require('../lib/statsConnexions.js');

const FENETRE_DEFAUT = 14; // jours affichés par défaut sur la courbe (le sélecteur propose 7 / 14 / 30)

// Nom affichable d'un compte : le nom de la FICHE stagiaire d'abord (le plus sûr), sinon le nom du
// compte, sinon l'e-mail. Réutilisé par la récence, les plus assidus et le survol par formation.
const NOM = "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', l.first_name, l.last_name)),''), "
    + "NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)),''), u.email, 'Compte')";

/**
 * GET /api/statistiques/connexions — pour la page Statistiques (Qualité & conformité).
 *
 * Deux vues, stagiaires et équipe séparés :
 *  · la RÉPARTITION PAR RÉCENCE, lue sur `user.last_login_at` (dispo tout de suite), + les NOMS à
 *    relancer (jamais connectés, > 30 jours) ;
 *  · les CONNEXIONS PAR JOUR sur une fenêtre réglable (7 / 14 / 30 j, `?jours=`), lues sur
 *    `connexion_jour` (migration 200) : comptes par jour, détail PAR FORMATION au survol, personnes
 *    distinctes sur la fenêtre, et les plus assidus. Sans la table, `par_jour` vaut null.
 */
const connexions = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const maintenant = new Date();
        let fenetre = Number(req.query.jours) || FENETRE_DEFAUT;
        if (!stats.FENETRES.includes(fenetre)) fenetre = FENETRE_DEFAUT;

        // Comptes + nom (fiche stagiaire d'abord) — sert à la récence ET aux listes « à relancer ».
        const [comptes] = await conn.query(
            `SELECT u.role, u.last_login_at, ${NOM} AS nom
               FROM user u
               LEFT JOIN learner l ON l.user_id = u.id AND l.organization_id = u.organization_id
              WHERE u.organization_id = ?`, [orgId]);
        const stagiaires = comptes.filter((c) => c.role === 'STAGIAIRE');
        const equipe = comptes.filter((c) => c.role !== 'STAGIAIRE');

        const vue = (liste) => ({
            total: liste.length,
            connectes30: stats.connectesDepuis(liste, 30, maintenant),
            jamais: liste.filter((c) => !c.last_login_at).length,
            recence: stats.repartition(liste, maintenant),
        });

        // Fenêtre glissante (connexion_jour, migration 200) — tolère l'absence de la table.
        let parJour = null; let resume = null; let assidus = null; let formationsCle = [];
        try {
            const borne = stats.fenetreJours(fenetre, maintenant)[0];
            const [lignes] = await conn.query(
                `SELECT DATE_FORMAT(jour, '%Y-%m-%d') AS jour,
                        SUM(est_stagiaire = 1) AS stagiaires, SUM(est_stagiaire = 0) AS equipe
                   FROM connexion_jour
                  WHERE organization_id = ? AND jour >= ?
                  GROUP BY jour`, [orgId, borne]);

            // Stagiaires par FORMATION et par jour, de façon PONDÉRÉE (un stagiaire inscrit à k
            // formations compte 1/k dans chacune → la barre se colore par formation, 50/50 pour NIV1+NIV2).
            // Une ligne BRUTE par (jour, stagiaire, formation) ; la pondération se fait en JS. Tolère un
            // schéma formations incomplet (pas de couleurs par formation, part stagiaire en « Sans formation »).
            const stagParJour = new Map(lignes.map((l) => [l.jour, Number(l.stagiaires) || 0]));
            let formParJour = new Map();
            try {
                const [fr] = await conn.query(
                    `SELECT DATE_FORMAT(cj.jour, '%Y-%m-%d') AS jour, cj.user_id AS uid,
                            p.id AS pkey, COALESCE(NULLIF(p.code, ''), p.title, 'Formation') AS label
                       FROM connexion_jour cj
                       JOIN learner l ON l.user_id = cj.user_id AND l.organization_id = cj.organization_id
                       JOIN enrollment e ON e.learner_id = l.id
                       JOIN training_session s ON s.id = e.session_id
                       JOIN training_program p ON p.id = s.program_id
                      WHERE cj.organization_id = ? AND cj.jour >= ? AND cj.est_stagiaire = 1`,
                    [orgId, borne]);
                const p = stats.pondererFormations(fr.map((r) => ({ jour: r.jour, uid: r.uid, key: r.pkey, label: r.label })), stagParJour);
                formParJour = p.parJour; formationsCle = p.cles;
            } catch (e) { if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e; }
            parJour = stats.densifier(lignes, fenetre, maintenant)
                .map((j) => ({ ...j, formations: formParJour.get(j.jour) || [] }));

            // Résumé de la fenêtre : combien de personnes DIFFÉRENTES se sont connectées, par groupe.
            const [uniq] = await conn.query(
                `SELECT est_stagiaire, COUNT(DISTINCT user_id) AS n
                   FROM connexion_jour WHERE organization_id = ? AND jour >= ? GROUP BY est_stagiaire`,
                [orgId, borne]);
            resume = {
                uniques_stagiaires: Number(uniq.find((r) => Number(r.est_stagiaire) === 1)?.n || 0),
                uniques_equipe: Number(uniq.find((r) => Number(r.est_stagiaire) === 0)?.n || 0),
            };

            // Les plus assidus : le plus de JOURS de connexion sur la fenêtre (stagiaires et équipe).
            const [top] = await conn.query(
                `SELECT cj.est_stagiaire AS stagiaire, COUNT(DISTINCT cj.jour) AS jours, ${NOM} AS nom
                   FROM connexion_jour cj
                   JOIN user u ON u.id = cj.user_id
                   LEFT JOIN learner l ON l.user_id = cj.user_id AND l.organization_id = cj.organization_id
                  WHERE cj.organization_id = ? AND cj.jour >= ?
                  GROUP BY cj.user_id, cj.est_stagiaire, ${NOM}
                  ORDER BY jours DESC, nom ASC
                  LIMIT 8`, [orgId, borne]);
            assidus = top.map((t) => ({ nom: t.nom, stagiaire: Number(t.stagiaire) === 1, jours: Number(t.jours) }));
        } catch (e) {
            if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
        }

        /* RÉCENCE PAR FORMATION (stagiaires) — colorer « Depuis la dernière connexion » comme la
           courbe. Lu sur enrollment (PAS connexion_jour), donc INDÉPENDANT de la 200 : dispo tout de
           suite. La tranche de récence joue le rôle du « jour » : on réutilise `pondererFormations`
           (un stagiaire inscrit à k formations compte 1/k dans chacune ; le reste en « Sans
           formation »). On unifie avec la courbe : une formation vue SEULEMENT en récence s'ajoute à
           `formations_cle` (mêmes couleurs, même légende), « Sans formation » reste en dernier. */
        let recenceFormations = {};
        try {
            const [frRec] = await conn.query(
                `SELECT u.id AS uid, u.last_login_at,
                        p.id AS pkey, COALESCE(NULLIF(p.code, ''), p.title, 'Formation') AS label
                   FROM user u
                   JOIN learner l ON l.user_id = u.id AND l.organization_id = u.organization_id
                   JOIN enrollment e ON e.learner_id = l.id
                   JOIN training_session s ON s.id = e.session_id
                   JOIN training_program p ON p.id = s.program_id
                  WHERE u.organization_id = ? AND u.role = 'STAGIAIRE'`, [orgId]);
            const stagRec = stats.repartition(stagiaires, maintenant);
            const rowsRec = frRec.map((r) => ({ jour: stats.trancheDe(r.last_login_at, maintenant), uid: r.uid, key: r.pkey, label: r.label }));
            const pr = stats.pondererFormations(rowsRec, new Map(Object.entries(stagRec)));
            recenceFormations = Object.fromEntries(pr.parJour);
            const avecAutre = formationsCle.some((c) => c.key === '__autre') || pr.cles.some((c) => c.key === '__autre');
            const sansAutre = formationsCle.filter((c) => c.key !== '__autre');
            const vus = new Set(sansAutre.map((c) => c.key));
            for (const c of pr.cles) if (c.key !== '__autre' && !vus.has(c.key)) { sansAutre.push(c); vus.add(c.key); }
            formationsCle = avecAutre ? [...sansAutre, { key: '__autre', label: 'Sans formation' }] : sansAutre;
        } catch (e) { if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e; }

        res.json({
            data: {
                stagiaires: { ...vue(stagiaires), relancer: stats.relancer(stagiaires, maintenant), recence_formations: recenceFormations },
                equipe: vue(equipe),
                par_jour: parJour,
                formations_cle: formationsCle,
                resume,
                assidus,
                fenetre,
                fenetres: stats.FENETRES,
                tranches: stats.TRANCHES,
            },
        });
    } catch (err) {
        console.error('Statistiques connexions :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { connexions };
