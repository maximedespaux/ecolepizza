/**
 * LES CONSENTEMENTS DU STAGIAIRE — les finalités déclarées, et leur formulation exacte.
 *
 * UN SEUL ENDROIT POUR LE TEXTE, et c'est la raison d'être de ce fichier. La phrase soumise à la
 * personne est stockée AVEC chaque réponse dans `consent_record.formulation` : ce qui est prouvé,
 * c'est l'accord à une rédaction donnée. La conséquence pratique est heureuse — reformuler ici ne
 * corrompt rien, les réponses passées gardent leur propre texte et restent démontrables telles
 * qu'elles ont été données.
 *
 * ⚠ À RELIRE PAR L'ORGANISME AVANT MISE EN LIGNE. La rédaction ci-dessous est défendable et
 * complète au regard de ce qu'exige un consentement éclairé — la finalité, les destinataires,
 * l'absence de conséquence en cas de refus, la possibilité de revenir dessus — mais elle engage
 * l'école, pas le développeur.
 *
 * LES DESTINATAIRES, EUX, NE SONT PLUS ÉCRITS ICI : ils sont lus dans la table `partner` au moment
 * où la question est posée (cf. `destinatairesPartenaires`). Une liste dans le code aurait vieilli
 * au premier partenaire ajouté.
 */

/**
 * POURQUOI UNE LISTE DE FINALITÉS PLUTÔT QU'UN SEUL DRAPEAU. Un consentement est SPÉCIFIQUE :
 * accepter que ses coordonnées partent chez un fournisseur ne vaut pas accepter de figurer sur une
 * photo de session. Chaque finalité se demande, se refuse et se retire séparément — et la table
 * les distingue déjà. En ajouter une ici suffit ; aucune migration.
 */
const FINALITES = {
    partenaires: {
        cle: 'partenaires',
        titre: 'Transmettre mes coordonnées aux partenaires de l\'école',
        /* Repli quand l'organisme n'a encore aucun partenaire enregistré, ou que la table est
           illisible. Le cas normal passe par `destinatairesPartenaires`, qui NOMME les entreprises
           — c'est ce qui rend le consentement « éclairé », une catégorie vague ne permettant pas
           de savoir à quoi l'on dit oui. */
        destinatairesParDefaut: 'Les partenaires référencés par l\'école',
        formulation:
            'J\'accepte que l\'école communique mon nom, mon adresse e-mail, mon téléphone et la '
            + 'formation que je suis à ses partenaires, afin qu\'ils puissent me proposer leurs '
            + 'offres et me contacter directement. Je peux revenir sur ce choix à tout moment '
            + 'depuis mon profil. Refuser n\'a aucune conséquence sur ma formation, mon inscription '
            + 'ou mon accès aux services de l\'école.',
        /* Ce que l'on transmet réellement si la personne accepte. Écrit ici pour que l'export ne
           puisse pas envoyer un champ qui n'a pas été annoncé. */
        champs: ['nom', 'prenom', 'email', 'telephone', 'formation', 'dates_session'],
    },
};

const FINALITES_CONNUES = Object.keys(FINALITES);

/**
 * LES DESTINATAIRES, LUS DANS LA TABLE `partner` — pas écrits en dur.
 *
 * C'est ce qui rend le consentement « éclairé » : on NOMME les entreprises qui recevront les
 * coordonnées, au lieu d'une catégorie vague à laquelle personne ne peut consentir utilement. Une
 * liste figée dans le code aurait vieilli au premier partenaire ajouté — la personne aurait alors
 * accepté pour des noms qui ne sont plus ceux d'aujourd'hui.
 *
 * Et c'est la liste LUE AU MOMENT DE LA RÉPONSE qui est gelée dans le registre : un partenaire
 * ajouté ensuite n'est couvert par aucun accord passé, puisque la personne ne pouvait pas le
 * connaître. Le décalage se voit alors en comparant la ligne du registre à la liste du jour, ce
 * qui est exactement l'information dont on a besoin pour savoir s'il faut redemander.
 */
async function destinatairesPartenaires(conn, orgId) {
    try {
        const [rows] = await conn.query(
            'SELECT name FROM partner WHERE organization_id = ? ORDER BY name', [orgId]);
        if (!rows.length) return FINALITES.partenaires.destinatairesParDefaut;
        const liste = rows.map((r) => r.name).filter(Boolean).join(', ');
        // La colonne fait 500 caractères. Tronquer en annonçant le reste plutôt que de couper net :
        // une liste amputée sans le dire laisserait croire qu'elle est complète.
        if (liste.length <= 470) return liste;
        const gardees = [];
        for (const n of rows.map((r) => r.name)) {
            if (gardees.join(', ').length + n.length > 440) break;
            gardees.push(n);
        }
        return `${gardees.join(', ')} et ${rows.length - gardees.length} autres`;
    } catch {
        return FINALITES.partenaires.destinatairesParDefaut;
    }
}

/** Détecte une table ou une colonne absente : la migration 130 peut ne pas être jouée. */
const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/**
 * L'état COURANT d'un stagiaire, finalité par finalité : la réponse la plus récente.
 *
 * `null` pour une finalité jamais demandée — et c'est une information à part entière, distincte
 * d'un refus. Le registre ne présume rien : une finalité sans ligne n'a jamais été posée.
 *
 * Renvoie `null` (et non un objet vide) si la migration n'est pas jouée : l'écran saura alors
 * qu'il n'a rien à proposer, plutôt que d'afficher une demande qu'il ne pourrait pas enregistrer.
 */
async function etatCourant(conn, orgId, learnerId) {
    try {
        const destinataires = await destinatairesPartenaires(conn, orgId);
        const [rows] = await conn.query(
            `SELECT c.finalite, c.accorde, c.destinataires, c.formulation, c.source,
                    DATE_FORMAT(c.decide_at, '%Y-%m-%d %H:%i') AS decide_at
               FROM consent_record c
               JOIN (SELECT finalite, MAX(decide_at) AS m
                       FROM consent_record
                      WHERE organization_id = ? AND learner_id = ?
                      GROUP BY finalite) d
                 ON d.finalite = c.finalite AND d.m = c.decide_at
              WHERE c.organization_id = ? AND c.learner_id = ?`,
            [orgId, learnerId, orgId, learnerId]);
        const par = {};
        for (const r of rows) par[r.finalite] = { ...r, accorde: Number(r.accorde) === 1 };
        return FINALITES_CONNUES.map((k) => ({
            cle: k,
            titre: FINALITES[k].titre,
            formulation: FINALITES[k].formulation,
            destinataires,
            // `null` = jamais demandé. C'est ce qui déclenche la fenêtre, et rien d'autre.
            accorde: par[k] ? par[k].accorde : null,
            decide_at: par[k] ? par[k].decide_at : null,
        }));
    } catch (e) {
        if (isMissingSchema(e)) return null;
        throw e;
    }
}

/**
 * Enregistre une réponse — EN AJOUTANT UNE LIGNE, jamais en modifiant la précédente.
 *
 * C'est tout l'intérêt du registre : on doit pouvoir démontrer l'état AU MOMENT DE CHAQUE ENVOI.
 * Un stagiaire qui accepte en mars, voit ses coordonnées transmises en avril puis retire son
 * accord en juin n'invalide pas l'envoi d'avril — encore faut-il que la trace de mars existe
 * toujours. Écraser une valeur détruirait précisément la preuve qu'on cherche à constituer.
 */
async function enregistrer(conn, { orgId, learnerId, finalite, accorde, source, saisiPar }) {
    const f = FINALITES[finalite];
    if (!f) return { ok: false, message: 'Finalité inconnue.' };
    try {
        // La liste TELLE QU'ELLE EST AU MOMENT DE LA RÉPONSE : c'est elle que la personne a lue.
        const destinataires = await destinatairesPartenaires(conn, orgId);
        await conn.query(
            `INSERT INTO consent_record
               (id, organization_id, learner_id, finalite, accorde, destinataires, formulation, source, saisi_par)
             VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orgId, learnerId, finalite, accorde ? 1 : 0,
             destinataires.slice(0, 500), f.formulation.slice(0, 600),
             source || 'espace_stagiaire', saisiPar || null]);
        return { ok: true };
    } catch (e) {
        if (isMissingSchema(e)) return { ok: false, message: 'Migration 130 non jouée : consentements non enregistrables.' };
        throw e;
    }
}

module.exports = { FINALITES, FINALITES_CONNUES, destinatairesPartenaires, etatCourant, enregistrer, isMissingSchema };
