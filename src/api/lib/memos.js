/**
 * LES MÉMOS DU PERSONNEL — ce que le serveur accepte d'écrire (demandé le 2026-09-22).
 *
 * Un pense-bête et une liste de choses à faire, dans la barre du haut et sur le tableau de bord.
 * Du JavaScript pur : les tests le lisent sans base. Les règles de visibilité (à qui appartient un
 * mémo, qui le voit, qui le coche) vivent dans le contrôleur, là où sont les requêtes qui les
 * appliquent.
 */

/** La borne de la colonne `memo.texte` (migration 176) : un pense-bête, pas un document. */
const MAX_TEXTE = 1000;

/**
 * CE QU'UN MÉMO PEUT DÉSIGNER (migration 177) — @ pour QUI, # pour QUOI.
 *
 * L'école a choisi ces six-là le 2026-09-22 : @ trouve un stagiaire, une entreprise ou un membre de
 * l'équipe ; # trouve une session, un partenaire, une facture. `ping` distingue le seul type qui
 * fait quelque chose de plus que lier : mentionner un collègue lui montre le mémo et allume une
 * pastille sur son bouton.
 *
 * `capacite` est la rubrique qu'il faut pouvoir ouvrir pour que le type soit proposé : inutile de
 * faire chercher des factures à qui n'y a pas accès — il verrait des numéros qu'il ne peut pas
 * ouvrir. Les MEMBRES n'en ont pas : leurs noms sont connus de tout le personnel (barre du haut,
 * signatures, communauté).
 */
const TYPES_LIEN = {
    stagiaire: { genre: '@', capacite: '/stagiaires' },
    entreprise: { genre: '@', capacite: '/entreprises' },
    membre: { genre: '@', capacite: null, ping: true },
    session: { genre: '#', capacite: '/sessions' },
    partenaire: { genre: '#', capacite: '/partenaires' },
    facture: { genre: '#', capacite: '/factures' },
};
const GENRES = ['@', '#'];
/** Un mémo n'est pas un annuaire : au-delà, c'est que le lien n'est plus le sujet. */
const MAX_LIENS = 8;
const MAX_LIBELLE = 160;
const estUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/**
 * Les liens d'un nouveau mémo → `{ liens }` ou `{ erreur }`. Chaque lien porte un type connu, un
 * identifiant qui ressemble à un identifiant, et le libellé LU AU MOMENT DU CHOIX — celui qui
 * restera lisible si la fiche disparaît. Les doublons sont écartés en silence : choisir deux fois
 * la même personne n'est pas une erreur, c'est un clic de trop.
 */
function lireLiens(v) {
    if (v === undefined || v === null || v === '') return { liens: [] };
    if (!Array.isArray(v)) return { erreur: 'Liens illisibles.' };
    const liens = [];
    const vus = new Set();
    for (const l of v) {
        const type = String((l && l.type) || '');
        if (!TYPES_LIEN[type]) return { erreur: `Type de lien inconnu : ${type || '(vide)'}.` };
        if (!estUuid(l.id)) return { erreur: 'Lien sans identifiant valable.' };
        const libelle = String(l.libelle == null ? '' : l.libelle).replace(/\s+/g, ' ').trim().slice(0, MAX_LIBELLE);
        if (!libelle) return { erreur: 'Lien sans nom.' };
        const cle = `${type}:${String(l.id).toLowerCase()}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        liens.push({ type, id: String(l.id).toLowerCase(), libelle });
    }
    if (liens.length > MAX_LIENS) return { erreur: `Un mémo porte ${MAX_LIENS} liens au plus.` };
    return { liens };
}

/**
 * « 2026-10-05 » si c'est une VRAIE date, `null` sinon. Le 30 février, « 05/10/2026 » ou un texte
 * libre ne passent pas : une échéance fausse ferait compter un rappel qui n'en est pas un.
 */
function dateValide(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(annee, mois - 1, jour));
    if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
    if (annee < 2000 || annee > 2100) return null;
    return m[0];
}

/**
 * Le corps d'un NOUVEAU mémo → `{ valeurs }` ou `{ erreur }`.
 *
 * Le texte est obligatoire et borné. L'échéance est facultative, mais si elle est donnée elle doit
 * être une vraie date — la refuser vaut mieux que l'ignorer : on croirait avoir posé un rappel.
 * Le partage n'est vrai que s'il est explicitement vrai : un mémo naît privé.
 */
function lireNouveauMemo(b = {}) {
    /* PLUSIEURS LIGNES SONT ACCEPTÉES, ET C'EST TOUT L'INTÉRÊT : « ce qu'il faut faire » s'écrit en
       liste. Trois nettoyages, et pas un de plus — on garde ce qui a été tapé :
         · les fins de ligne de Windows deviennent des « \n », sinon le compte de caractères et le
           découpage en puces varieraient selon le navigateur ;
         · les espaces en bout de ligne partent : invisibles, ils feraient d'une puce vide (« * »
           suivi d'une espace) une ligne que rien ne distingue d'une puce écrite ;
         · au-delà de deux retours d'affilée, on retombe à deux : un mémo fait de vingt lignes
           vides pousserait tout le reste de la liste hors de l'écran, pour rien. */
    const texte = String(b.texte == null ? '' : b.texte)
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!texte) return { erreur: 'Écrivez le mémo avant de l’ajouter.' };
    if (texte.length > MAX_TEXTE) return { erreur: `Un mémo tient en ${MAX_TEXTE} caractères au plus.` };
    let echeance = null;
    if (b.echeance !== undefined && b.echeance !== null && b.echeance !== '') {
        echeance = dateValide(b.echeance);
        if (!echeance) return { erreur: 'Échéance illisible, choisissez une date dans le calendrier.' };
    }
    return { valeurs: { texte, echeance, partage: b.partage === true } };
}

/**
 * Ce qu'une modification demande → `{ fait?, partage? }` ou `{ erreur }`. Deux gestes seulement :
 * cocher (ou décocher), et partager (ou reprendre). Chacun doit être un vrai booléen — « oui »,
 * 1 ou "true" ne cochent rien, pour qu'une réponse illisible ne passe pas pour un accord.
 */
function lireModification(b = {}) {
    const out = {};
    for (const k of ['fait', 'partage']) {
        if (b[k] === undefined) continue;
        if (typeof b[k] !== 'boolean') return { erreur: `« ${k} » attend vrai ou faux.` };
        out[k] = b[k];
    }
    if (!Object.keys(out).length) return { erreur: 'Rien à modifier.' };
    return { modification: out };
}

module.exports = { MAX_TEXTE, MAX_LIENS, TYPES_LIEN, GENRES, dateValide, lireNouveauMemo, lireModification, lireLiens, estUuid };
