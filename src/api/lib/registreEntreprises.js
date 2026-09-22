/**
 * LE REGISTRE DES ENTREPRISES — de quoi compléter une fiche entreprise, ou l'écarter.
 *
 * LA SOURCE : l'API « Recherche d'entreprises » de l'État (recherche-entreprises.api.gouv.fr, celle
 * de l'Annuaire des entreprises). Pappers et societe.com republient ces mêmes données — le
 * répertoire Sirene de l'INSEE et le registre national des entreprises — ; l'API les donne sans
 * clé ni compte, et son usage automatisé est permis (sept appels par seconde). Pappers demande une
 * clé payante, et societe.com interdit qu'on extraie ses pages par programme.
 *
 * CE QUE LE REGISTRE NE DIT PAS : ni e-mail ni téléphone — aucun registre public ne les porte —, ni
 * l'OPCO, qui se déduirait de la convention collective, mais que l'école nomme à sa façon.
 *
 * Du JavaScript sans base ni réseau : l'appel au registre est PASSÉ (`chercher`), si bien qu'un test
 * rejoue des réponses figées. L'outil qui lit et écrit la base est database/tools/completer-
 * entreprises.js ; ce module, lui, décide.
 *
 * LES RÈGLES, TRANCHÉES PAR L'UTILISATEUR LE 2026-09-22 :
 *   · rien trouvé au registre : la fiche est supprimée ;
 *   · trouvée mais FERMÉE (entreprise radiée) : supprimée aussi — personne n'y est rattaché ;
 *   · trouvée et active : complétée — seulement ce qui est VIDE, jamais ce que l'école a saisi ;
 *   · sans SIRET, on cherche par le nom, et l'on ne complète que si c'est SANS AMBIGUÏTÉ : une
 *     seule entreprise active de ce nom, au même code postal (ou dans la même ville). Plusieurs
 *     candidates, un nom voisin, le même nom ailleurs : la fiche n'est pas touchée, elle est listée
 *     pour qu'un humain tranche.
 *   · une panne du registre n'est JAMAIS un « introuvable » : seule une réponse reçue, et vide,
 *     autorise à conclure qu'il n'y a rien.
 */

/* ── Les noms ───────────────────────────────────────────────────────────────────────────── */

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const mots = (s) => sansAccents(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/* Ce qui ne distingue pas une entreprise d'une autre : sa forme juridique, l'article en tête de son
   nom. « SARL Le Napoli » et « LE NAPOLI » sont la même enseigne. */
const FORMES = new Set(['SARL', 'SAS', 'SASU', 'EURL', 'EI', 'EIRL', 'SA', 'SCI', 'SNC', 'SELARL', 'SOCIETE', 'STE', 'ETS',
    'ETABLISSEMENTS', 'ENTREPRISE']);
const ARTICLES = new Set(['LE', 'LA', 'LES', 'L']);
/* Les mots du MÉTIER, que partagent la moitié des fiches de l'école : « Pizzeria Le Napoli » est
   inscrite au registre sous l'enseigne « LE NAPOLI ». Ils sont ôtés pour comparer — sauf si le nom
   n'est fait que d'eux (« La Pizzeria »), qui se compare alors tel quel. */
const METIER = new Set(['PIZZA', 'PIZZAS', 'PIZZERIA', 'PIZZERIE', 'PIZZAIOLO', 'RESTAURANT', 'RESTO', 'SNACK', 'BAR', 'CAFE',
    'BRASSERIE', 'TRAITEUR', 'BOULANGERIE', 'PATISSERIE', 'FOOD', 'TRUCK', 'CHEZ']);
const LIAISONS = new Set(['DE', 'DU', 'DES', 'D', 'ET', 'A', 'AU', 'AUX', 'EN', 'SUR']);

/** Deux formes canoniques : sans les mots du métier (`fort`), et avec (`faible`). */
function formesDuNom(nom) {
    const m = mots(nom).filter((x) => !FORMES.has(x));
    while (m.length && ARTICLES.has(m[0])) m.shift();
    const faible = m.join(' ');
    const fort = m.filter((x) => !METIER.has(x) && !ARTICLES.has(x)).join(' ');
    return { fort, faible };
}

/** Le même nom, à la forme juridique, à l'article et aux mots du métier près. */
function memesNoms(a, b) {
    const x = formesDuNom(a), y = formesDuNom(b);
    if (x.fort && x.fort === y.fort) return true;
    return !!x.faible && x.faible === y.faible;
}

/** Les mots qui DISTINGUENT un nom (trois lettres au moins, ni métier, ni forme, ni liaison). */
function motsDistinctifs(nom) {
    return new Set(mots(nom).filter((x) => x.length >= 3 && !FORMES.has(x) && !METIER.has(x) && !ARTICLES.has(x) && !LIAISONS.has(x)));
}
const partagentUnMot = (a, b) => { const y = motsDistinctifs(b); return [...motsDistinctifs(a)].some((x) => y.has(x)); };

/** Tous les noms sous lesquels le registre connaît un résultat : raison sociale, sigle, enseignes… */
function nomsDuResultat(r, etab) {
    const noms = [r.nom_complet, r.nom_raison_sociale, r.sigle];
    // « DUPONT JEAN (PIZZA MOMO) » : le nom commercial entre parenthèses, et le reste.
    const m = /^(.*)\(([^)]+)\)\s*$/.exec(r.nom_complet || '');
    if (m) noms.push(m[1], m[2]);
    for (const e of [etab, ...(r.matching_etablissements || [])].filter(Boolean)) {
        noms.push(e.nom_commercial, ...(e.liste_enseignes || []));
    }
    return [...new Set(noms.filter((n) => n && String(n).trim()))];
}
const nomCorrespond = (nom, r, etab) => nomsDuResultat(r, etab).some((n) => memesNoms(nom, n));
const nomVoisin = (nom, r, etab) => nomsDuResultat(r, etab).some((n) => partagentUnMot(nom, n));

/* ── Les lieux ──────────────────────────────────────────────────────────────────────────── */

/* « ST GAUDENS », « Saint-Gaudens », « SAINT GAUDENS CEDEX » : la même ville. */
function villeNormalisee(v) {
    const m = mots(v).filter((x) => x !== 'CEDEX' && !/^\d+$/.test(x));
    if (m[0] === 'ST') m[0] = 'SAINT';
    if (m[0] === 'STE') m[0] = 'SAINTE';
    return m.join(' ');
}
const codePostal = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 5 ? d : null; };

/** L'établissement est-il au lieu de la fiche ? Code postal d'abord, ville à défaut. `null` : on ne sait pas. */
function memeLieu(entreprise, etab) {
    const cp = codePostal(entreprise.zip_code);
    if (cp) return etab.code_postal === cp;
    const ville = villeNormalisee(entreprise.town);
    if (ville) return villeNormalisee(etab.libelle_commune) === ville;
    return null;
}

/* ── Les identifiants ───────────────────────────────────────────────────────────────────── */

/** Le SIRET de la fiche : 14 chiffres, ou 9 (un SIREN saisi à sa place), sinon rien d'exploitable. */
function identifiant(siret) {
    const d = String(siret || '').replace(/[\s.\-/]/g, '');
    if (/^\d{14}$/.test(d)) return { type: 'siret', valeur: d };
    if (/^\d{9}$/.test(d)) return { type: 'siren', valeur: d };
    return null;
}

/* ── Ce que le registre apporte ─────────────────────────────────────────────────────────── */

/* La catégorie juridique INSEE vers la liste du formulaire entreprise (EntrepriseDetail.jsx).
   « Micro / Auto » ne se lit pas au registre : un micro-entrepreneur y est un entrepreneur
   individuel (1000), et le reste. */
function formeJuridique(code) {
    const c = String(code || '');
    if (!/^\d{4}$/.test(c)) return null;
    if (c === '1000') return 'EI';
    if (c === '5498') return 'EURL';
    if (c.startsWith('54')) return 'SARL';
    if (c === '5720') return 'SASU';
    if (c.startsWith('57')) return 'SAS';
    if (c.startsWith('55') || c.startsWith('56')) return 'SA';
    if (c === '6540') return 'SCI';
    if (c.startsWith('92')) return 'Association';
    return 'Autre';
}

/* Le référent : le dirigeant qui signe — gérant, président, directeur général —, et pour un
   entrepreneur individuel, lui-même. Une personne morale (une holding présidente) n'est pas un
   référent qu'on joint ; les commissaires aux comptes non plus. Le PREMIER prénom seulement : le
   formulaire range « Prénom NOM », et la création du compte du représentant coupe au premier mot. */
const ROLES = [
    [/^co-?g[ée]rant|^g[ée]rant/i, 'Gérant(e)'],
    [/^pr[ée]sident/i, 'Président(e)'],
    [/^directeur g[ée]n[ée]ral/i, 'Directeur général / Directrice générale'],
];
function referent(r) {
    const personnes = (r.dirigeants || []).filter((d) => d.type_dirigeant === 'personne physique' && d.nom);
    const nom = (d) => [String(d.prenoms || '').trim().split(/\s+/)[0], d.nom].filter(Boolean).join(' ').toLocaleUpperCase('fr');
    if (String(r.nature_juridique) === '1000' && personnes[0]) {
        return { representative_name: nom(personnes[0]), representative_role: "Chef(fe) d'entreprise" };
    }
    for (const [re, role] of ROLES) {
        const d = personnes.find((p) => re.test(String(p.qualite || '')));
        if (d) return { representative_name: nom(d), representative_role: role };
    }
    return null;
}

// Une valeur masquée (entrepreneur qui s'est opposé à la diffusion) n'est pas une valeur.
const diffusible = (v) => v != null && String(v).trim() !== '' && !/NON[- ]DIFFUSIBLE|\[ND\]/i.test(String(v));

/** « 4 RUE OLYMPE DE GOUGES 92230 GENNEVILLIERS » → « 4 RUE OLYMPE DE GOUGES » : la rue, sans le code ni la ville. */
function ligneAdresse(etab) {
    const a = String(etab.adresse || '').trim();
    const cp = String(etab.code_postal || '');
    const i = cp ? a.lastIndexOf(` ${cp}`) : -1;
    const ligne = (i > 0 ? a.slice(0, i) : [etab.numero_voie, etab.indice_repetition, etab.type_voie, etab.libelle_voie].filter(Boolean).join(' ')).trim();
    return diffusible(ligne) ? ligne : null;
}

/** Les champs de la fiche entreprise, lus au registre (une valeur absente ou masquée n'y figure pas). */
function champsDuRegistre(r, etab) {
    const out = {
        siret: etab.siret,
        naf_ape: r.activite_principale ? String(r.activite_principale).replace(/\./g, '') : null,
        address: ligneAdresse(etab),
        zip_code: etab.code_postal,
        town: etab.libelle_commune ? String(etab.libelle_commune).toLocaleUpperCase('fr') : null,
        legal_status: formeJuridique(r.nature_juridique),
        date_creation: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date_creation || '')) ? r.date_creation : null,
        ...(referent(r) || {}),
    };
    return Object.fromEntries(Object.entries(out).filter(([, v]) => diffusible(v)));
}

const vide = (v) => v == null || String(v).trim() === '';

/**
 * Ce qu'on écrit vraiment : les champs VIDES de la fiche, rien d'autre. Deux exceptions pour le
 * SIRET, qui ne contredisent rien : un SIREN saisi à sa place (le SIRET le prolonge), et une
 * valeur qui n'est pas un numéro (« en cours »). La fonction du référent ne s'écrit qu'avec son
 * nom : poser « Gérant(e) » à côté d'un référent choisi par l'école le dirait gérant à tort.
 */
function aCompleter(entreprise, champs) {
    const out = {};
    for (const [k, v] of Object.entries(champs)) {
        if (k === 'siret') {
            const id = identifiant(entreprise.siret);
            if (vide(entreprise.siret) || !id || (id.type === 'siren' && String(v).startsWith(id.valeur))) out.siret = v;
            continue;
        }
        if (k === 'representative_role') continue;
        if (vide(entreprise[k])) out[k] = v;
    }
    if (out.representative_name && champs.representative_role && vide(entreprise.representative_role)) {
        out.representative_role = champs.representative_role;
    }
    return out;
}

/* ── La décision ────────────────────────────────────────────────────────────────────────── */

const active = (r, e) => r.etat_administratif === 'A' && e.etat_administratif === 'A';
const decrire = (r, e) => ({ siren: r.siren, siret: e.siret, nom: r.nom_complet, commune: `${e.code_postal || ''} ${e.libelle_commune || ''}`.trim(),
    etat: r.etat_administratif === 'C' ? 'radiée' : e.etat_administratif === 'F' ? 'établissement fermé' : 'active' });
const etablissements = (r) => (r.matching_etablissements && r.matching_etablissements.length ? r.matching_etablissements : [r.siege].filter(Boolean));

function completer(entreprise, r, etab, motif) {
    const champs = aCompleter(entreprise, champsDuRegistre(r, etab));
    const registre = decrire(r, etab);
    return Object.keys(champs).length
        ? { action: 'completer', motif, champs, registre }
        : { action: 'deja_complete', motif: `${motif} — rien à ajouter`, registre };
}

/** Recherche PAR LE NOM (pas de SIRET exploitable, ou un SIRET inconnu du registre). */
async function parLeNom(entreprise, chercher) {
    const nom = String(entreprise.name || '').trim();
    if (formesDuNom(nom).faible.length < 3) return { action: 'supprimer', motif: 'nom inexploitable, aucune recherche possible' };
    const cp = codePostal(entreprise.zip_code);
    const local = await chercher(cp ? { q: nom, code_postal: cp } : { q: nom });
    const paires = (local.results || []).flatMap((r) => etablissements(r).map((e) => ({ r, e })));
    const lieuConnu = !!(cp || villeNormalisee(entreprise.town));

    const fortes = paires.filter(({ r, e }) => memeLieu(entreprise, e) && nomCorrespond(nom, r, e));
    const actives = fortes.filter(({ r, e }) => active(r, e));
    // Une entreprise, plusieurs établissements au même endroit : une seule candidate.
    const unites = new Map(actives.map((p) => [p.r.siren, p]));
    if (unites.size === 1) {
        const [{ r, e }] = unites.values();
        return completer(entreprise, r, e, `trouvée par son nom au ${cp || villeNormalisee(entreprise.town)}`);
    }
    if (unites.size > 1) {
        return { action: 'a_verifier', motif: `${unites.size} entreprises actives de ce nom à cet endroit`, candidats: [...unites.values()].map(({ r, e }) => decrire(r, e)) };
    }
    if (fortes.length) {
        if (fortes.every(({ r }) => r.etat_administratif === 'C')) {
            return { action: 'supprimer', motif: 'fermée : radiée du registre', registre: decrire(fortes[0].r, fortes[0].e) };
        }
        return { action: 'a_verifier', motif: 'établissement fermé à cette adresse, l\'entreprise existe toujours', candidats: fortes.map(({ r, e }) => decrire(r, e)) };
    }
    // Rien de sûr. Un nom VOISIN au même endroit, ou le même nom ailleurs : un humain tranche.
    const voisines = paires.filter(({ r, e }) => memeLieu(entreprise, e) && nomVoisin(nom, r, e));
    if (voisines.length) {
        return { action: 'a_verifier', motif: 'noms proches à cet endroit', candidats: voisines.slice(0, 5).map(({ r, e }) => decrire(r, e)) };
    }
    // Sans code postal, la première recherche portait déjà sur toute la France : inutile d'y revenir.
    const ailleurs = cp ? ((await chercher({ q: nom })).results || []).flatMap((r) => etablissements(r).map((e) => ({ r, e }))) : paires;
    const memeNom = ailleurs.filter(({ r, e }) => nomCorrespond(nom, r, e));
    if (memeNom.length) {
        return {
            action: 'a_verifier',
            motif: lieuConnu ? 'ce nom existe, mais pas à cet endroit' : 'ce nom existe, et la fiche n\'a ni code postal ni ville pour trancher',
            candidats: memeNom.slice(0, 5).map(({ r, e }) => decrire(r, e)),
        };
    }
    return { action: 'supprimer', motif: 'introuvable au registre' };
}

/**
 * Décide du sort d'une fiche entreprise NON RATTACHÉE (l'outil écarte les autres avant).
 * `chercher(params)` → la réponse JSON de /search ; elle LÈVE si le registre ne répond pas.
 * → { action: 'completer' | 'deja_complete' | 'supprimer' | 'a_verifier' | 'erreur', motif, champs?, registre?, candidats? }
 */
async function analyser(entreprise, chercher) {
    try {
        const id = identifiant(entreprise.siret);
        if (!id) return await parLeNom(entreprise, chercher);
        const rep = await chercher({ q: id.valeur });
        let trouve = null;
        for (const r of rep.results || []) {
            const e = id.type === 'siret'
                ? [...(r.matching_etablissements || []), r.siege].filter(Boolean).find((x) => x.siret === id.valeur)
                : (r.siren === id.valeur ? r.siege : null);
            if (e) { trouve = { r, e }; break; }
        }
        if (!trouve) {
            // Un SIRET faux : on cherche par le nom, mais sans rien corriger tout seul.
            const parNom = await parLeNom(entreprise, chercher);
            if (parNom.action === 'completer' || parNom.action === 'deja_complete') {
                return { action: 'a_verifier', motif: `SIRET ${id.valeur} inconnu du registre ; même nom au même endroit, SIRET ${parNom.registre.siret}`, candidats: [parNom.registre] };
            }
            return parNom.action === 'supprimer' ? { ...parNom, motif: `SIRET ${id.valeur} inconnu du registre, et ${parNom.motif}` } : parNom;
        }
        const { r, e } = trouve;
        if (r.etat_administratif === 'C') return { action: 'supprimer', motif: 'fermée : radiée du registre', registre: decrire(r, e) };
        if (e.etat_administratif === 'F') {
            return { action: 'a_verifier', motif: 'cet établissement est fermé, l\'entreprise existe toujours', candidats: [decrire(r, r.siege || e)] };
        }
        const nom = String(entreprise.name || '');
        if (!nomCorrespond(nom, r, e) && !nomVoisin(nom, r, e)) {
            return { action: 'a_verifier', motif: `le SIRET désigne « ${r.nom_complet} »`, candidats: [decrire(r, e)] };
        }
        return completer(entreprise, r, e, `trouvée par son ${id.type === 'siret' ? 'SIRET' : 'SIREN'}`);
    } catch (err) {
        return { action: 'erreur', motif: `registre injoignable (${err.message})` };
    }
}

module.exports = {
    analyser, champsDuRegistre, aCompleter, formeJuridique, referent, ligneAdresse, identifiant,
    memesNoms, formesDuNom, motsDistinctifs, memeLieu, villeNormalisee, nomsDuResultat,
};
