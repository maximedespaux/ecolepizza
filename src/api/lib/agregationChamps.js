/**
 * AGRÉGER LES « CHAMPS DOCUMENTS » QUAND UN DOCUMENT COUVRE PLUSIEURS FORMATIONS (2026-10-03).
 *
 * LE DÉFAUT. Un devis professionnel peut porter sur plusieurs formations d'un coup (NIV1 + NIV2,
 * cas de l'entreprise Gervais Christelle). Les jetons `field:training_program.*` /
 * `field:training_session.*` se remplissaient depuis la SEULE première inscription
 * (`document_formation … LIMIT 1`, document.controller) : l'intitulé, les objectifs, les
 * prérequis, le prix, le déroulé… tout ne montrait que NIV1, sans un mot. On agrège désormais
 * TOUTES les inscriptions du document — nativement, sans bloc à écrire dans le modèle.
 *
 * RÈGLES (le même esprit que les jetons nommés, cf. resolveTokens) :
 *   · un MONTANT ou une DURÉE (prix, acompte, heures, jours) → la SOMME : un devis annonce un total,
 *     et la somme des lignes doit tomber dessus au centime ;
 *   · un TEXTE LONG (objectifs, prérequis, programme, déroulé, détail des horaires) → un bloc par
 *     formation, précédé de son intitulé, quand ils DIFFÈRENT (sinon le texte commun, une fois) ;
 *   · tout le reste (intitulé, code, public, semaine, lieu…) → les valeurs DISTINCTES jointes « et ».
 *
 * CE QU'ON N'AGRÈGE PAS. Seules les tables qui varient d'une formation à l'autre (training_program,
 * training_session, enrollment). Le stagiaire, l'entreprise et l'organisme d'un document ne changent
 * pas d'une inscription à l'autre : on garde leur première valeur, exactement comme avant — un
 * document de groupe liste ses stagiaires par le bloc {#Stagiaires}, pas en collant des noms « et ».
 */

/* Jointure « à la française » : [a] → « a » ; [a,b] → « a et b » ; [a,b,c] → « a, b et c ». */
function joindreFr(valeurs) {
    const a = (valeurs || []).map((v) => (v == null ? '' : String(v))).filter((s) => s.trim() !== '');
    if (a.length <= 1) return a[0] || '';
    return a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
}

const uniq = (arr) => [...new Set(arr)];

/* Colonnes dont les valeurs s'ADDITIONNENT (montants, durées). `year` / `week` n'en sont PAS : on
   ne « somme » pas des numéros de semaine — ils se joignent « et » comme le reste. */
const COLONNE_SOMME = /(^|_)(price|prix|amount|montant|acompte|hours|heures|days|jours|duree|duration|capital|total)(_|$)/;
/* Parmi les sommes, les MONTANTS (le tarif, l'acompte…) sont PAR STAGIAIRE : le total d'un groupe
   est la somme des inscriptions — même quand le tarif est porté par training_program. On les
   additionne donc sur TOUTES les inscriptions. Le reste des sommes (hours, days, duree…) sont des
   DURÉES, propriétés de la SESSION : on les agrège une fois par session distincte, sinon elles
   seraient multipliées par le nombre de stagiaires (défaut relevé le 2026-10-07, puis sa régression
   sur le prix). */
const COLONNE_MONTANT = /(^|_)(price|prix|amount|montant|acompte|capital|total)(_|$)/;
/* Colonnes de TEXTE LONG (une forme, ligne par ligne) : un bloc par formation quand elles diffèrent.
   `audience` (Public) en est volontairement absente : resolveTokens la joint, elle aussi, en liste. */
const COLONNE_LONGUE = new Set(['objectives', 'prerequisites', 'program_detail', 'objective_general', 'duration_detail']);
/* Les seules tables qui varient d'une formation à l'autre dans un même document. */
const TABLES_AGREGEES = new Set(['training_program', 'training_session', 'enrollment']);

function premierPresent(valeurs) {
    for (const v of valeurs) if (v != null && String(v).trim() !== '') return v;
    return valeurs.length ? valeurs[0] : undefined;
}

/* PREMIER INDICE PAR SESSION DISTINCTE. Sans clés (ou mal alignées), tous les indices — le
   comportement d'avant. Sert à n'agréger les champs de SESSION/FORMATION qu'une fois par session :
   sinon, sur un document de groupe (N inscrits, une même session), une durée serait multipliée par N. */
function indicesParSession(n, sessionKeys) {
    if (!Array.isArray(sessionKeys) || sessionKeys.length !== n) return Array.from({ length: n }, (_, i) => i);
    const vus = new Set(); const idx = [];
    for (let i = 0; i < n; i++) { const k = sessionKeys[i] == null ? `#${i}` : String(sessionKeys[i]); if (!vus.has(k)) { vus.add(k); idx.push(i); } }
    return idx;
}

/**
 * `listeFaits`  : un objet de faits PAR inscription, DÉJÀ déchiffré, dans l'ordre des formations.
 * `catalog`     : les champs activés (getEnabledFields), avec { key, table, column, type }.
 * `sessionKeys` : l'identifiant de SESSION de chaque inscription, aligné sur `listeFaits` (facultatif).
 * Renvoie { 'table.column': valeur agrégée } — prête à devenir un jeton field:<table.column>.
 */
function agregerChamps(listeFaits, catalog, sessionKeys) {
    const out = {};
    const liste = (listeFaits || []).filter(Boolean);
    if (!liste.length) return out;
    const idxSession = indicesParSession(liste.length, sessionKeys);
    for (const f of catalog || []) {
        const cle = f.key;
        const brut = liste.map((faits) => faits[cle]);
        if (brut.every((v) => v === undefined)) continue; // champ absent des faits : on n'invente rien
        // Les tables qui ne varient pas d'une formation à l'autre : première valeur, comme avant.
        if (!TABLES_AGREGEES.has(f.table)) { out[cle] = premierPresent(brut); continue; }
        const colonne = String(f.column || cle.split('.').pop() || '').toLowerCase();
        /* SUR QUOI AGRÉGER. Un MONTANT (prix, acompte…) est PAR STAGIAIRE — le total d'un groupe est
           la somme des inscriptions, même quand le tarif est porté par training_program : on le
           somme sur TOUTES les inscriptions. Une DURÉE, un intitulé, des dates… sont des propriétés
           de la SESSION : on les agrège sur les SESSIONS DISTINCTES, sinon une durée serait
           multipliée par le nombre de stagiaires, et un texte long répété autant de fois. */
        const parInscription = (f.table === 'enrollment') || COLONNE_MONTANT.test(colonne);
        const indices = parInscription ? liste.map((_, i) => i) : idxSession;
        const sousListe = indices.map((i) => liste[i]);
        const presents = indices.map((i) => brut[i]).filter((v) => v != null && String(v).trim() !== '');
        if (!presents.length) { out[cle] = premierPresent(brut); continue; }
        if (f.type === 'bool') {
            const b = presents.map((v) => v === true || v === 1 || v === '1' || v === 'true');
            out[cle] = b.every(Boolean) ? true : b.every((x) => !x) ? false : 'Oui et Non';
        } else if (f.type === 'number') {
            const nums = presents.map(Number).filter(Number.isFinite);
            out[cle] = COLONNE_SOMME.test(colonne)
                ? nums.reduce((s, n) => s + n, 0)
                : joindreFr(uniq(nums.map(String)));
        } else if (COLONNE_LONGUE.has(colonne)) {
            const distincts = uniq(presents.map(String));
            out[cle] = distincts.length <= 1 ? distincts[0]
                : sousListe.map((faits) => {
                    const t = faits[cle];
                    if (t == null || String(t).trim() === '') return '';
                    const titre = faits['training_program.title'];
                    return titre ? `${titre} :\n${t}` : String(t);
                }).filter(Boolean).join('\n\n');
        } else {
            out[cle] = joindreFr(uniq(presents.map(String)));
        }
    }
    return out;
}

module.exports = { joindreFr, agregerChamps, indicesParSession, uniq, COLONNE_SOMME, COLONNE_MONTANT, COLONNE_LONGUE, TABLES_AGREGEES };
