const crypto = require('crypto');
const db = require('../config/database.js');

const INSERT = `INSERT INTO audit_log (id, organization_id, user_id, action, entity, entity_id)
             VALUES (?, ?, ?, ?, ?, ?)`;
/* La forme LONGUE ne sert qu'aux traces qui portent des précisions (migration 186). Les autres
   gardent la forme courte : elles s'écrivent à l'identique avant comme après la migration. */
const INSERT_PRECIS = `INSERT INTO audit_log (id, organization_id, user_id, action, entity, entity_id, libelle, learner_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UN ÉCHEC DU JOURNAL SE SIGNALE UNE FOIS, ET EN DISANT QUOI FAIRE.
 *
 * L'écriture reste non bloquante, et c'est voulu : une action réussie ne doit pas échouer parce
 * que sa trace n'a pas pu s'écrire. Mais jusqu'ici, chaque échec laissait dans la console le
 * message brut de MariaDB, à CHAQUE appel. C'est ainsi que les enregistrements de modèles ont
 * disparu du journal sans que personne ne le voie (cf. la migration 175) : le message était là,
 * à chaque enregistrement, et à force de se répéter plus personne ne le lisait.
 *
 * Chaque nature d'échec est donc dite UNE fois par démarrage du serveur, avec sa conséquence.
 */
const dejaSignales = new Set();
function signalerUneFois(cle, message) {
    if (dejaSignales.has(cle)) return;
    dejaSignales.add(cle);
    console.error(message);
}

/**
 * La colonne `entity_id` a-t-elle refusé l'identifiant ?
 *
 * Elle était de type `uuid` jusqu'à la migration 175 : un slug de modèle (« grille-jury ») ou un
 * nom de rôle (« FORMATEUR ») y est refusé en mode strict — « Incorrect uuid value … for column
 * `entity_id` » —, et la LIGNE ENTIÈRE avec lui. Après la 175, seul un identifiant de plus de 64
 * caractères le serait (« Data too long for column 'entity_id' »). Dans les deux cas le message
 * nomme la colonne : on lit ce nom plutôt qu'une liste de codes d'erreur.
 */
function identifiantRefuse(err) {
    return !!err && /entity_id/.test(String(err.message || ''));
}

/**
 * LES PRÉCISIONS D'UNE TRACE, mises au propre — ou `null` s'il n'y a rien à garder.
 *
 * `{ libelle, stagiaire }` : le NOM de l'objet à cet instant (« Devis particulier ») et l'identifiant
 * du stagiaire concerné. On ne les passe que quand la ligne ne suffira pas à les retrouver plus tard
 * (cf. lib/precisionsActivite.js) : ce qui vient d'être SUPPRIMÉ, ou ce dont l'identifiant ne désigne
 * pas le dossier — une note se journalise sous l'identifiant de l'EXERCICE.
 *
 * Tout le reste est ignoré, et c'est une garde : Pizza Quest passait en cinquième argument des objets
 * de « détails » ({ title }, `req.body`…) que rien ne lisait — ils disent désormais `{ libelle }`, mais
 * un champ inattendu ne doit jamais devenir une colonne remplie. Le stagiaire n'est gardé qu'en UUID :
 * la colonne est de ce type, et un refus coûterait la ligne entière (le défaut de la 175).
 */
function lirePrecisions(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const libelle = typeof p.libelle === 'string' ? p.libelle.replace(/\s+/g, ' ').trim().slice(0, 255) : '';
    const stagiaire = typeof p.stagiaire === 'string' && UUID.test(p.stagiaire) ? p.stagiaire : null;
    return libelle || stagiaire ? { libelle: libelle || null, stagiaire } : null;
}

/**
 * Journalise une action sensible (best-effort, non bloquant).
 *
 * QUATRE ARGUMENTS À PLAT, jamais un objet : `logAudit(req, { action, entity, entityId })` écrit
 * « [object Object] » dans la colonne `action` et laisse l'entité vide. C'est arrivé deux fois (le
 * consentement de l'espace stagiaire, puis les catégories de partenaires), et
 * `audit-identifiant-entite.test.js` le refuse désormais. Le CINQUIÈME, facultatif, est le seul
 * objet admis : les précisions (cf. `lirePrecisions`).
 *
 * L'identifiant n'est pas toujours un UUID : un modèle de document se désigne par son slug, un
 * rôle système par son nom. La colonne prend tout ce qui tient en 64 caractères (migration 175).
 *
 * @param {object} req  requête Express (pour organization_id + user id)
 * @param {string} action  ex. « document.send », « learner.create »
 * @param {string} [entity]  ex. « GeneratedDocument »
 * @param {string} [entityId]  UUID, slug ou nom — 64 caractères au plus
 * @param {{ libelle?: string, stagiaire?: string }} [precisions]  ce que la ligne ne pourra plus
 *   retrouver seule (migration 186)
 * @returns {Promise<void>} résolue une fois la trace écrite, ou abandonnée. JAMAIS rejetée :
 *   les appelants n'ont pas à l'attendre, et un `await` ne peut pas les faire échouer.
 */
function logAudit(req, action, entity = null, entityId = null, precisions = null) {
    return new Promise((fin) => {
        const abandon = (err) => {
            const cause = (err && err.message) || String(err);
            signalerUneFois(`echec:${(err && err.code) || cause}`,
                `audit_log : trace « ${action} » perdue — ${cause}. Les échecs suivants de même `
                + 'nature ne seront plus signalés jusqu\'au prochain démarrage.');
            fin();
        };
        const ecrire = (sql, valeurs, siEchec) => {
            try {
                db.query(sql, valeurs, (err) => (err ? siEchec(err) : fin()));
            } catch (e) {
                siEchec(e);
            }
        };
        try {
            const valeurs = [crypto.randomUUID(), req.user?.organization_id || null, req.user?.id || null,
                action, entity, entityId];
            const simple = () => ecrire(INSERT, valeurs, (err) => {
                if (entityId == null || !identifiantRefuse(err)) return abandon(err);
                /* LA LIGNE SANS SON IDENTIFIANT, PLUTÔT QUE PAS DE LIGNE DU TOUT. Qui a fait quoi,
                   et quand, c'est ce qu'on vient relire ; « sur quel modèle » n'en est que le
                   détail. Avant la 175, c'est le sort de tout ce qui ne s'identifie pas par un
                   UUID. La ligne garde son `id` : si la première écriture était passée malgré
                   l'erreur, la seconde buterait sur la clé primaire au lieu de doubler la trace. */
                const enUuid = /uuid/i.test(err.message);
                const remede = enUuid
                    ? 'La colonne est encore en uuid : tout ce qui se désigne autrement (slug de modèle, '
                      + 'nom de rôle) y est refusé — jouer la migration 175.'
                    : 'L\'identifiant dépasse les 64 caractères que la colonne accepte.';
                signalerUneFois(enUuid ? 'entity_id:uuid' : 'entity_id:longueur',
                    `audit_log : la colonne entity_id refuse « ${entityId} » (${action}) — ${err.message}. `
                    + `La trace est gardée SANS son identifiant. ${remede} `
                    + 'Signalé une seule fois jusqu\'au prochain démarrage.');
                ecrire(INSERT, [...valeurs.slice(0, 5), null], abandon);
            });
            const p = lirePrecisions(precisions);
            if (!p) return simple();
            /* AVEC PRÉCISIONS : la forme longue d'abord. Si elle échoue — colonnes absentes avant la
               186, ou tout autre refus —, la trace repart par la forme COURTE, avec toutes ses
               protections : on perd le nom figé, jamais la ligne. Même `id` pour les deux essais. */
            ecrire(INSERT_PRECIS, [...valeurs, p.libelle, p.stagiaire], (err) => {
                if (err && err.code === 'ER_BAD_FIELD_ERROR') {
                    signalerUneFois('precisions:migration',
                        `audit_log : les colonnes libelle / learner_id manquent (${action}) — jouer la migration `
                        + '186. La trace est gardée SANS ses précisions : un document supprimé restera '
                        + '« Document supprimé », sans nom. Signalé une seule fois jusqu\'au prochain démarrage.');
                }
                simple();
            });
        } catch (e) {
            abandon(e);
        }
    });
}

module.exports = { logAudit, lirePrecisions };
