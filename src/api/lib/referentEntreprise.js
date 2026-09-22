/**
 * LE RÉFÉRENT D'UNE ENTREPRISE : un stagiaire, ou une personne saisie (demandé le 2026-09-22, migration 174).
 *
 * Il tenait dans un seul champ, « Nom du référent », en capitales : « JEAN DUPONT », « DUPONT »,
 * « DUPONT JEAN » — rien ne disait où finissait le prénom, et la création du compte du représentant
 * coupait au premier mot. Il se dit désormais de deux façons :
 *   · UN STAGIAIRE : on le choisit, et sa civilité, son prénom et son nom SUIVENT SA FICHE —
 *     recopiés à l'enregistrement de l'entreprise, puis de nouveau quand sa fiche change
 *     (`suivreStagiaire`). Recopiés plutôt que relus à chaque usage : documents, jetons, liste et
 *     compte du représentant lisent tous ces colonnes-là, et n'ont rien de plus à savoir ;
 *   · UNE AUTRE PERSONNE : civilité, NOM (en capitales, comme partout) et prénom, saisis.
 * `representative_name` porte donc le NOM seul quand le prénom est rempli, et le nom complet sur les
 * fiches d'avant : `nomReferent` rassemble les deux cas.
 *
 * AVANT LA MIGRATION 174, rien ne se perd : sans colonne pour le prénom, il rejoint
 * `representative_name` (« JEAN DUPONT », la forme d'avant) ; sans colonne pour le lien, les noms du
 * stagiaire sont recopiés quand même, et la réponse dit (`ignores`) que le lien n'a pas été gardé.
 */
const { enCapitales } = require('./saisie.js');
const { colonneExiste } = require('./colonnes.js');

/** « Jean DUPONT » — ou le nom complet d'une fiche d'avant, rangé tout entier dans le nom. */
const nomReferent = (c) => [c && c.representative_first_name, c && c.representative_name]
    .map((x) => String(x || '').trim()).filter(Boolean).join(' ');

/**
 * Applique le choix du référent à un corps d'entreprise déjà normalisé (normaliserEntreprise).
 * `colonnes` : celles que la table porte (colonnesEntreprise). Modifie `b`.
 * → `{ erreur }` (stagiaire introuvable dans l'organisme), ou `{ ignores }` (ce qui n'a pu être gardé).
 */
async function appliquerReferent(conn, orgId, b, colonnes) {
    const ignores = [];
    if (b.representative_learner_id !== undefined) {
        const id = String(b.representative_learner_id || '').trim();
        if (id) {
            /* LE STAGIAIRE DE CET ORGANISME, et lui seul : un identifiant venu d'ailleurs ferait
               imprimer, sur les conventions de l'école, le nom d'une personne qu'elle ne connaît pas. */
            const [[l]] = await conn.query(
                'SELECT civility, first_name, last_name FROM learner WHERE id = ? AND organization_id = ?', [id, orgId]);
            if (!l) return { erreur: 'Stagiaire introuvable : choisissez-en un autre, ou saisissez le référent.' };
            b.representative_learner_id = id;
            b.representative_civ = l.civility || null;
            b.representative_first_name = l.first_name || null;
            b.representative_name = enCapitales(l.last_name) || null;
        } else {
            b.representative_learner_id = null; // « une autre personne » : le lien est défait
        }
        if (!colonnes.includes('representative_learner_id')) {
            if (b.representative_learner_id) ignores.push('representative_learner_id');
            delete b.representative_learner_id;
        }
    }
    if (b.representative_first_name !== undefined) {
        const prenom = String(b.representative_first_name || '').trim();
        b.representative_first_name = prenom || null;
        if (!colonnes.includes('representative_first_name')) {
            // Avant la 174 : le prénom rejoint le nom, dans la forme d'avant (« JEAN DUPONT »).
            if (prenom && b.representative_name !== undefined) {
                b.representative_name = enCapitales(`${prenom} ${b.representative_name || ''}`.trim());
            } else if (prenom) {
                ignores.push('representative_first_name');
            }
            delete b.representative_first_name;
        }
    }
    return { ignores };
}

/**
 * La fiche d'un stagiaire a changé : les entreprises dont il est le référent suivent — civilité,
 * prénom, nom. Jamais bloquant : le stagiaire est enregistré, c'est l'essentiel ; une recopie ratée
 * se rattrape au prochain enregistrement de l'entreprise.
 */
async function suivreStagiaire(conn, learnerId) {
    try {
        if (!learnerId || !await colonneExiste(conn, 'company', 'representative_learner_id')) return;
        await conn.query(
            `UPDATE company c JOIN learner l ON l.id = c.representative_learner_id
                SET c.representative_civ = l.civility, c.representative_first_name = l.first_name,
                    c.representative_name = l.last_name
              WHERE l.id = ?`, [learnerId]);
    } catch (e) {
        console.error('Référent entreprise, recopie depuis la fiche stagiaire :', e.message);
    }
}

module.exports = { nomReferent, appliquerReferent, suivreStagiaire };
