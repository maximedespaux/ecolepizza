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
        /* LES SIX CHAMPS D'ORIGINE — le défaut, et le repli quand la migration 135 n'est pas
           jouée. L'école peut désormais restreindre cette liste depuis ses réglages ; sans la
           colonne, on retombe ici, c'est-à-dire sur ce qui était annoncé jusqu'alors. */
        champsParDefaut: ['nom', 'prenom', 'email', 'telephone', 'formation', 'dates_session'],
    },
};

/**
 * LES CHAMPS TRANSMISSIBLES, et le mot par lequel on les annonce à la personne.
 *
 * L'ORDRE DE CET OBJET EST L'ORDRE DE LA PHRASE. « mon nom, mon prénom, mon adresse e-mail… » se
 * lit dans cet ordre-là, quel que soit celui dans lequel l'école a coché les cases : une
 * énumération qui change de séquence d'un stagiaire à l'autre donnerait deux textes différents
 * pour un même choix, et le registre garderait deux preuves qui n'ont pas l'air d'être la même.
 */
/** Détecte une table ou une colonne absente : la migration 130 peut ne pas être jouée. */
const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

const CHAMPS_TRANSMISSIBLES = {
    nom: { libelle: 'Nom', annonce: 'mon nom' },
    prenom: { libelle: 'Prénom', annonce: 'mon prénom' },
    email: { libelle: 'Adresse e-mail', annonce: 'mon adresse e-mail' },
    telephone: { libelle: 'Téléphone', annonce: 'mon téléphone' },
    formation: { libelle: 'Formation suivie', annonce: 'la formation que je suis' },
    dates_session: { libelle: 'Dates de session', annonce: 'les dates de ma session' },
    entreprise: { libelle: 'Entreprise (si elle finance)', annonce: 'le nom de l\'entreprise qui finance ma formation' },
    ville: { libelle: 'Ville', annonce: 'ma ville' },
};

/** Ne garde que des clés connues, sans doublon, dans l'ordre d'annonce. */
function champsValides(liste) {
    const demandes = new Set((Array.isArray(liste) ? liste : String(liste || '').split(','))
        .map((c) => String(c).trim()).filter(Boolean));
    return Object.keys(CHAMPS_TRANSMISSIBLES).filter((c) => demandes.has(c));
}

/**
 * LA PHRASE SOUMISE À LA PERSONNE, CONSTRUITE DEPUIS LES CHAMPS — jamais écrite à côté.
 *
 * C'est le point qui rend l'ensemble tenable. Tant que le texte était figé et la liste de champs
 * à côté, les deux pouvaient diverger en silence : l'école retirait le téléphone de l'export et
 * la phrase continuait de l'annoncer, ou l'inverse — un consentement obtenu pour six champs
 * servant à en transmettre sept. En dérivant l'un de l'autre, l'écart devient impossible.
 *
 * Conséquence à connaître : changer la liste change la formulation, donc le texte des
 * consentements À VENIR. Les réponses déjà données gardent la leur, figée dans le registre — et
 * c'est exactement ce qui permet de savoir à quoi chacun a dit oui.
 */
function formulationPour(champs) {
    const retenus = champsValides(champs);
    const liste = retenus.map((c) => CHAMPS_TRANSMISSIBLES[c].annonce);
    /* AUCUN CHAMP COCHÉ : la phrase ne doit pas devenir « J'accepte que l'école communique à ses
       partenaires », qui ne veut rien dire. On l'énonce, plutôt que de produire un texte bancal
       qu'on ferait ensuite signer. */
    const quoi = liste.length === 0 ? null
        : liste.length === 1 ? liste[0]
            : `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`;
    if (!quoi) {
        return 'Aucune information n\'est actuellement transmise aux partenaires de l\'école.';
    }
    return `J'accepte que l'école communique ${quoi} à ses partenaires, afin qu'ils puissent me `
        + 'proposer leurs offres et me contacter directement. Je peux revenir sur ce choix à tout '
        + 'moment depuis mon profil. Refuser n\'a aucune conséquence sur ma formation, mon '
        + 'inscription ou mon accès aux services de l\'école.';
}

/**
 * Les champs que l'organisme a choisi de transmettre. Repli sur les six d'origine si la migration
 * 135 n'est pas jouée — c'est-à-dire sur ce qui était annoncé jusqu'alors, donc sans changement
 * visible pour personne.
 */
async function champsOrganisme(conn, orgId) {
    try {
        const [rows] = await conn.query(
            'SELECT partner_fields FROM organization WHERE id = ?', [orgId]);
        const v = rows[0]?.partner_fields;
        if (v === undefined) throw Object.assign(new Error('colonne absente'), { code: 'ER_BAD_FIELD_ERROR' });
        return champsValides(v);
    } catch (e) {
        if (!isMissingSchema(e)) throw e;
        return [...FINALITES.partenaires.champsParDefaut];
    }
}

const { CONTRAT_VALABLE } = require('./contratPartenaire.js');

const FINALITES_CONNUES = Object.keys(FINALITES);

/**
 * LES SOURCES ADMISES pour une réponse. Une valeur libre laisserait entrer « oui » ou « ok » dans
 * une colonne dont l'utilité est précisément de dire OÙ RETROUVER LA PREUVE en cas de contestation.
 *
 * `espace_stagiaire` est la seule que le stagiaire produit lui-même ; les trois autres sont saisies
 * par l'organisme POUR quelqu'un, et laissent donc `saisi_par` rempli. La distinction n'est pas
 * cosmétique : une réponse saisie par un tiers se conteste, celle donnée en ligne se retrace.
 */
const SOURCES = {
    espace_stagiaire: 'Espace stagiaire',
    papier: 'Formulaire papier',
    oral: 'Recueilli oralement',
    inscription: 'Dossier d\'inscription',
};

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
async function partenairesDestinataires(conn, orgId) {
    /* AVANT / APRÈS LA MIGRATION 131. Avec la colonne, seuls les partenaires cochés sont
       destinataires ; sans elle, on retombe sur l'annuaire entier — le comportement d'avant, qui
       reste juste tant que personne n'a pu restreindre quoi que ce soit.
       `colonne` dit LEQUEL des deux mondes on lit : l'appelant doit pouvoir distinguer « aucun
       partenaire coché » (donc personne ne reçoit rien) de « la colonne n'existe pas encore »
       (donc tout le monde reçoit). Les confondre ferait annoncer « aucun destinataire » sur une
       base où la transmission fonctionne, ou l'inverse. */
    try {
        /* UN CONTRAT ÉCHU RETIRE LE PARTENAIRE DE LA LISTE NOMMÉE. Continuer à l'annoncer ferait
           consentir à une transmission vers une entreprise avec qui l'école n'a plus d'accord —
           et le consentement porte sur « les partenaires de l'école », pas sur d'anciens
           partenaires. La condition est partagée avec le filtrage de l'export et de la vitrine :
           les trois doivent dire la même chose, sinon un partenaire disparaît d'un écran tout en
           recevant encore des coordonnées. */
        const [rows] = await conn.query(
            `SELECT p.name FROM partner p
              WHERE p.organization_id = ? AND p.recoit_coordonnees = 1 AND ${CONTRAT_VALABLE('p')}
              ORDER BY p.name`,
            [orgId]);
        return { rows, colonne: true };
    } catch (e) {
        if (!isMissingSchema(e)) throw e;
        const [rows] = await conn.query(
            'SELECT name FROM partner WHERE organization_id = ? ORDER BY name', [orgId]);
        return { rows, colonne: false };
    }
}

async function destinatairesPartenaires(conn, orgId) {
    try {
        const { rows, colonne } = await partenairesDestinataires(conn, orgId);
        /* AUCUN DESTINATAIRE SE DIT, il ne se devine pas. Retomber sur « les partenaires
           référencés par l'école » quand la colonne existe et que personne n'est coché
           annoncerait des destinataires qu'il n'y a pas — et le stagiaire consentirait à une
           transmission qui n'aura pas lieu, ce qu'aucune preuve ne devrait affirmer. */
        if (!rows.length) {
            return colonne
                ? 'Aucun partenaire n\'est actuellement destinataire de vos coordonnées.'
                : FINALITES.partenaires.destinatairesParDefaut;
        }
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
        const champs = await champsOrganisme(conn, orgId);
        return FINALITES_CONNUES.map((k) => ({
            cle: k,
            titre: FINALITES[k].titre,
            /* LA PHRASE DU JOUR, dérivée des champs actuellement choisis. Celle qui a été
               ACCEPTÉE est ailleurs — figée sur la ligne du registre — et c'est la comparaison
               des deux qui dit si l'accord couvre encore ce qu'on transmet. */
            formulation: formulationPour(champs),
            champs,
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
 * L'état courant de PLUSIEURS stagiaires d'un coup, pour une finalité — la vue de l'organisme.
 *
 * POURQUOI PAS `etatCourant` DANS UNE BOUCLE : une session de quinze stagiaires ferait trente
 * requêtes (une par personne, plus la liste des partenaires à chaque tour) là où deux suffisent.
 * Mais surtout, l'écran de suivi doit pouvoir dire « personne n'a jamais été sollicité » d'un seul
 * regard : c'est une lecture d'ensemble, pas quinze lectures individuelles.
 *
 * Rend une `Map` identifiant → { accorde, decide_at, source, destinataires }. UN STAGIAIRE ABSENT
 * DE LA MAP N'A JAMAIS ÉTÉ SOLLICITÉ — et c'est exactement l'information dont l'organisme a
 * besoin : ni un oui, ni un non, mais une question jamais posée, qu'il faut donc poser.
 *
 * ELLE LAISSE PASSER L'ERREUR au lieu de rendre `null`, à la différence d'`etatCourant`. Les deux
 * contrats sont volontairement opposés, parce que les deux écrans le sont : côté STAGIAIRE, une
 * table absente doit se traduire par le silence (on ne lui montre pas une demande qu'on ne saurait
 * pas enregistrer) ; côté ORGANISME, elle doit CRIER — c'est lui qui produit la liste, et une
 * lecture qui échoue en silence lui ferait croire que personne n'a consenti.
 *
 * Et un `null` uniforme effaçait le CODE de l'erreur, donc la seule chose qui distingue « table
 * absente » (migration à jouer) de « colonne inconnue » (défaut de code). L'appelant annonçait
 * alors une migration manquante pour un bug de requête, envoyant chercher la panne là où elle
 * n'était pas.
 */
async function etatParStagiaire(conn, orgId, learnerIds, finalite = 'partenaires') {
    const ids = (learnerIds || []).filter(Boolean);
    if (!ids.length) return new Map();
    const trous = ids.map(() => '?').join(',');
    /* `c.champs` ARRIVE AVEC LA 135, et son absence est un état LÉGITIME — pas un défaut de
       code. Sans ce repli, la requête lèverait `ER_BAD_FIELD_ERROR` et l'appelant l'annoncerait
       comme un bug logiciel (cf. `refusLecture`), alors qu'il suffit de jouer une migration.
       On tente donc avec, puis sans. */
    const requete = (avecChamps) => `SELECT c.learner_id, c.accorde, c.source, c.destinataires,
                ${avecChamps ? 'c.champs,' : 'NULL AS champs,'}
                DATE_FORMAT(c.decide_at, '%Y-%m-%d %H:%i') AS decide_at
           FROM consent_record c
           JOIN (SELECT learner_id, MAX(decide_at) AS m
                   FROM consent_record
                  WHERE organization_id = ? AND finalite = ? AND learner_id IN (${trous})
                  GROUP BY learner_id) d
             ON d.learner_id = c.learner_id AND d.m = c.decide_at
          WHERE c.organization_id = ? AND c.finalite = ?`;
    const args = [orgId, finalite, ...ids, orgId, finalite];
    let rows;
    try { [rows] = await conn.query(requete(true), args); }
    catch (e) {
        if (!isMissingSchema(e)) throw e;
        [rows] = await conn.query(requete(false), args);
    }
    const par = new Map();
    /* DEUX RÉPONSES À LA MÊME SECONDE — le cas se produit sur un import, ou sur un double clic.
       La jointure par `MAX(decide_at)` en rend alors deux : on garde la PREMIÈRE rencontrée plutôt
       que d'écraser au hasard, et le désaccord reste visible dans la table, qui est la seule
       preuve. Ne jamais « corriger » en supprimant : le registre est en ajout seul. */
    for (const r of rows) {
        if (par.has(r.learner_id)) continue;
        /* `champs` À NULL = réponse ANTÉRIEURE à la 135. On la lit comme « les six d'origine » :
           c'était la seule liste possible à l'époque, donc la seule chose qu'on sache avec
           certitude de ce qui lui a été montré. Supposer autre chose serait inventer. */
        par.set(r.learner_id, {
            ...r,
            accorde: Number(r.accorde) === 1,
            champsAnnonces: r.champs ? champsValides(r.champs) : [...FINALITES.partenaires.champsParDefaut],
        });
    }
    return par;
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
    /* UNE SOURCE INCONNUE EST REFUSÉE, elle n'est pas remplacée par un défaut. Retomber en
       silence sur « espace stagiaire » ferait passer pour une réponse donnée en ligne ce que
       quelqu'un a saisi à la place du stagiaire — soit exactement l'inverse de ce que cette
       colonne existe pour établir. */
    const src = source || 'espace_stagiaire';
    if (!SOURCES[src]) return { ok: false, message: `Source de réponse inconnue : ${src}.` };
    try {
        // La liste TELLE QU'ELLE EST AU MOMENT DE LA RÉPONSE : c'est elle que la personne a lue.
        const destinataires = await destinatairesPartenaires(conn, orgId);
        /* CE QUI A ÉTÉ ANNONCÉ, FIGÉ AVEC LA RÉPONSE. La phrase seule ne suffirait pas : la
           relire pour en extraire les champs demanderait d'analyser de la prose, et une
           reformulation casserait l'analyse. La liste est donc stockée telle quelle, à côté du
           texte qu'elle a produit. */
        const champs = await champsOrganisme(conn, orgId);
        const formulation = formulationPour(champs);
        try {
            await conn.query(
                `INSERT INTO consent_record
                   (id, organization_id, learner_id, finalite, accorde, destinataires, formulation,
                    champs, source, saisi_par)
                 VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orgId, learnerId, finalite, accorde ? 1 : 0,
                 destinataires.slice(0, 500), formulation.slice(0, 600),
                 champs.join(','), src, saisiPar || null]);
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            // Migration 135 non jouée : on écrit sans la colonne plutôt que de refuser la réponse.
            await conn.query(
                `INSERT INTO consent_record
                   (id, organization_id, learner_id, finalite, accorde, destinataires, formulation, source, saisi_par)
                 VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orgId, learnerId, finalite, accorde ? 1 : 0,
                 destinataires.slice(0, 500), formulation.slice(0, 600), src, saisiPar || null]);
        }
        return { ok: true };
    } catch (e) {
        if (isMissingSchema(e)) return { ok: false, message: 'Migration 130 non jouée : consentements non enregistrables.' };
        throw e;
    }
}

module.exports = {
    FINALITES, FINALITES_CONNUES, SOURCES,
    CHAMPS_TRANSMISSIBLES, champsValides, formulationPour, champsOrganisme,
    destinatairesPartenaires, partenairesDestinataires, etatCourant, etatParStagiaire, enregistrer, isMissingSchema,
};
