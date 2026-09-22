/**
 * L'IMPORT DE STAGIAIRES ET D'ENTREPRISES PAR FICHIER CSV (demandé le 2026-09-22).
 *
 * Le fichier se lit dans le navigateur (src/app/ui/lib/csv.js : encodage, séparateur, colonnes) ; il
 * arrive ici en lignes déjà nommées — { last_name, first_name, email, … }. C'est le SERVEUR qui
 * décide, seul : mêmes conventions de saisie que les formulaires (normaliserSaisie,
 * normaliserEntreprise, passées par le contrôleur), mêmes formats, et deux temps — un ESSAI qui
 * n'écrit rien et dit ligne par ligne ce qui se passera, puis l'import, qui refait les mêmes
 * contrôles au lieu de croire ceux de l'écran.
 *
 * Du JavaScript sans base : le contrôleur charge les fiches existantes et écrit ; ce module décide.
 *
 * LES RÈGLES, TRANCHÉES PAR L'UTILISATEUR LE 2026-09-22 :
 *   · seul le NOM est exigé — nom et prénom d'un stagiaire, nom d'une entreprise. Les vieilles listes
 *     n'ont souvent pas le reste ; le repère « Fiche incomplète » dira ce qui manque ;
 *   · une ligne qui désigne une fiche DÉJÀ LÀ est SAUTÉE, et dite ; la fiche existante n'est pas
 *     touchée. Un stagiaire se reconnaît à son e-mail (à défaut d'e-mail, à ses nom, prénom et date
 *     de naissance) ; une entreprise à son SIRET, ou à son nom au même code postal ;
 *   · un champ illisible — e-mail, date, civilité, SIRET… — n'empêche pas d'importer la ligne : il est
 *     laissé de côté, et dit. Seul un nom manquant la refuse.
 *
 * CE QUI NE S'IMPORTE PAS : le n° de sécurité sociale, l'identifiant France Travail, le montant CPF —
 * chiffrés ou sensibles, ils se saisissent fiche par fiche. Ni compte de connexion : il naît à
 * l'inscription à une session, comme pour une fiche créée à la main.
 */

const MAX_LIGNES = 2000;

/* Les champs qu'on accepte, et leur largeur en base : une valeur trop longue ferait échouer l'écriture
   de toute la ligne — elle est laissée de côté, et dite. */
const LARGEURS = {
    stagiaire: {
        civility: 10, last_name: 120, first_name: 120, email: 255, phone: 30, birthday: null, birth_place: 120,
        address: 255, zip_code: 10, town: 120, professional_status: 120, entreprise_siret: null, entreprise_nom: null,
    },
    entreprise: {
        name: 255, siret: 20, vat_number: 20, naf_ape: 10, legal_status: 30, date_creation: null, address: 255,
        zip_code: 10, town: 120, email: 255, phone: 30, opco: 120, representative_civ: 10,
        representative_first_name: 120, representative_name: 255, representative_role: 120,
    },
};
const CHAMPS_STAGIAIRE = Object.keys(LARGEURS.stagiaire);
const CHAMPS_ENTREPRISE = Object.keys(LARGEURS.entreprise);

/* La situation professionnelle : les six valeurs du formulaire (STATUTS, EditStagiaireModal.jsx — un
   test vérifie qu'elles ne divergent pas), et les manières courantes de les écrire. */
const STATUTS_PRO = ['En activité', "Demandeur d'emploi", 'Sans activité', 'Étudiant', 'Retraité', 'Autre'];
const SYNONYMES_SITUATION = {
    SALARIE: 'En activité', SALARIEE: 'En activité',
    CHOMEUR: "Demandeur d'emploi", CHOMEUSE: "Demandeur d'emploi", 'DEMANDEUSE D EMPLOI': "Demandeur d'emploi",
    ETUDIANTE: 'Étudiant', RETRAITEE: 'Retraité',
};

const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const cle = (s) => sansAccents(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const vide = (v) => v == null || String(v).trim() === '';
const chiffres = (v) => String(v ?? '').replace(/\D/g, '');

/** « M », « Monsieur », « Mr » → « M. » ; « Madame », « Mlle » → « Mme ». `undefined` : vide ; `null` : illisible. */
function civilite(v) {
    const t = cle(v).replace(/ /g, '');
    if (!t) return undefined;
    if (['M', 'MR', 'MONSIEUR'].includes(t)) return 'M.';
    if (['MME', 'MADAME', 'MLLE', 'MELLE', 'MADEMOISELLE'].includes(t)) return 'Mme';
    return null;
}

/** Une des six situations du formulaire, ou `null` (illisible), ou `undefined` (vide). */
function situation(v) {
    const t = cle(v);
    if (!t) return undefined;
    return STATUTS_PRO.find((s) => cle(s) === t) || SYNONYMES_SITUATION[t] || null;
}

/**
 * Une date lisible : « 25/03/1990 », « 25-03-1990 », « 25.03.1990 », « 1990-03-25 » — et l'heure qu'Excel
 * y colle parfois (« 25/03/1990 00:00 »). → « 1990-03-25 », `null` si illisible ou impossible (31/02,
 * dans le futur, avant 1900), `undefined` si vide. Pas d'année à deux chiffres : « 25/03/90 » dit-il
 * 1990 ou 2090 ? On ne devine pas une date de naissance.
 */
function lireDate(v, maintenant = new Date()) {
    const t = String(v ?? '').trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
    if (!t) return undefined;
    let j; let m; let a; let x;
    if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [, j, m, a] = x;
    else if ((x = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(t))) [, a, m, j] = x;
    else return null;
    const d = new Date(Date.UTC(+a, +m - 1, +j));
    if (d.getUTCFullYear() !== +a || d.getUTCMonth() !== +m - 1 || d.getUTCDate() !== +j) return null;
    if (+a < 1900 || d > maintenant) return null;
    return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/* Le nom d'une entreprise pour la reconnaître : sans casse, sans accents, sans ponctuation, sans sa
   forme juridique — « SARL Le Petit Four » et « le petit four » sont la même. */
const FORMES = new Set(['SARL', 'SAS', 'SASU', 'EURL', 'EI', 'EIRL', 'SA', 'SCI', 'SNC', 'SELARL', 'SOCIETE', 'STE', 'ETS', 'ETABLISSEMENTS']);
const nomCanonique = (n) => cle(n).split(' ').filter((x) => x && !FORMES.has(x)).join(' ');
const siretOk = (v) => { const d = chiffres(v); return d.length === 14 || d.length === 9; };

/** Garde les champs connus, retire les vides : une cellule vide ne dit rien, elle n'efface rien. */
function garder(ligne, champs) {
    const out = {};
    for (const k of champs) if (!vide(ligne?.[k])) out[k] = String(ligne[k]).trim();
    return out;
}
/** Laisse de côté ce qui dépasse la largeur de sa colonne. */
function largeurs(v, type, avert, libelles) {
    for (const [k, max] of Object.entries(LARGEURS[type])) {
        if (max && v[k] != null && String(v[k]).length > max) {
            avert.push(`${libelles[k] || k} trop long (${String(v[k]).length} caractères, ${max} au plus) : laissé de côté`);
            delete v[k];
        }
    }
}
const numero = (ligne, i) => (Number.isInteger(ligne?._ligne) ? ligne._ligne : i + 2); // l'en-tête est la ligne 1

const LIBELLES_STAGIAIRE = {
    civility: 'civilité', last_name: 'nom', first_name: 'prénom', email: 'e-mail', phone: 'téléphone', birthday: 'date de naissance',
    birth_place: 'lieu de naissance', address: 'adresse', zip_code: 'code postal', town: 'ville', professional_status: 'situation',
};

/**
 * Les lignes STAGIAIRES, une à une. `existants` : [{ email, last_name, first_name, birthday }] ;
 * `entreprises` : [{ id, name, siret, zip_code }] ; `normaliser` : normaliserSaisie ; `reEmail` : RE_EMAIL.
 * → [{ ligne, nom, statut: 'a_creer' | 'doublon' | 'erreur', motif?, avertissements, valeurs?, company_id? }]
 */
function analyserStagiaires(lignes, { existants = [], entreprises = [], normaliser, reEmail }) {
    const parEmail = new Map(existants.filter((e) => e.email).map((e) => [String(e.email).trim().toLowerCase(), e]));
    const cleNom = (l) => `${cle(l.last_name)}|${cle(l.first_name)}`;
    const parNom = new Map();
    for (const e of existants) {
        const k = cleNom(e);
        if (!parNom.has(k)) parNom.set(k, []);
        parNom.get(k).push(e);
    }
    const vusEmail = new Map(); const vusNom = new Map();
    const siretEntreprise = new Map(entreprises.filter((c) => chiffres(c.siret).length === 14).map((c) => [chiffres(c.siret), c]));

    return lignes.map((brute, i) => {
        const ligne = numero(brute, i);
        const avertissements = [];
        const v = normaliser(garder(brute, CHAMPS_STAGIAIRE));
        const nom = [v.last_name, v.first_name].filter(Boolean).join(' ');
        if (v.email && !reEmail.test(v.email)) { avertissements.push(`e-mail « ${v.email} » invalide : laissé de côté`); delete v.email; }
        if (v.civility !== undefined) {
            const c = civilite(v.civility);
            if (c) v.civility = c; else { avertissements.push(`civilité « ${v.civility} » inconnue (M. ou Mme) : laissée de côté`); delete v.civility; }
        }
        if (v.professional_status !== undefined) {
            const s = situation(v.professional_status);
            if (s) v.professional_status = s; else { avertissements.push(`situation « ${v.professional_status} » inconnue : laissée de côté`); delete v.professional_status; }
        }
        if (v.birthday !== undefined) {
            const d = lireDate(v.birthday);
            if (d) v.birthday = d; else { avertissements.push(`date de naissance « ${v.birthday} » illisible (JJ/MM/AAAA) : laissée de côté`); delete v.birthday; }
        }
        largeurs(v, 'stagiaire', avertissements, LIBELLES_STAGIAIRE);
        // Le seul refus : sans nom ni prénom (ou trop longs pour leur colonne), pas de fiche.
        if (vide(v.last_name) || vide(v.first_name)) {
            return { ligne, nom, statut: 'erreur', motif: 'nom et prénom requis', avertissements };
        }

        // DÉJÀ LÀ ? Par l'e-mail ; sans e-mail, par le nom — et la date de naissance, si les deux l'ont.
        if (v.email) {
            if (parEmail.has(v.email)) return { ligne, nom, statut: 'doublon', motif: 'une fiche porte déjà cet e-mail', avertissements };
            if (vusEmail.has(v.email)) return { ligne, nom, statut: 'doublon', motif: `même e-mail que la ligne ${vusEmail.get(v.email)}`, avertissements };
            vusEmail.set(v.email, ligne);
        } else {
            const compatibles = (e) => !e.birthday || !v.birthday || String(e.birthday).slice(0, 10) === v.birthday;
            if ((parNom.get(cleNom(v)) || []).some(compatibles)) {
                return { ligne, nom, statut: 'doublon', motif: 'une fiche porte déjà ces nom et prénom (et aucun e-mail pour les distinguer)', avertissements };
            }
            const avant = vusNom.get(cleNom(v));
            if (avant && compatibles(avant)) return { ligne, nom, statut: 'doublon', motif: `mêmes nom et prénom que la ligne ${avant.ligne}`, avertissements };
            vusNom.set(cleNom(v), { ligne, birthday: v.birthday });
        }

        /* L'ENTREPRISE, si la ligne en nomme une : par son SIRET, sinon par son nom — une seule. Un
           stagiaire rattaché est « professionnel » : sans cela, le formulaire défait le lien au premier
           enregistrement (il ne garde l'entreprise que pour un devis professionnel). */
        let companyId = null;
        const siretE = chiffres(v.entreprise_siret);
        if (siretE || v.entreprise_nom) {
            let c = siretE.length === 14 ? siretEntreprise.get(siretE) : null;
            let plusieurs = false;
            if (!c && v.entreprise_nom) {
                const memes = entreprises.filter((x) => nomCanonique(x.name) && nomCanonique(x.name) === nomCanonique(v.entreprise_nom));
                if (memes.length === 1) [c] = memes;
                plusieurs = memes.length > 1;
            }
            if (c) companyId = c.id;
            else if (plusieurs) avertissements.push(`plusieurs entreprises s'appellent « ${v.entreprise_nom} » : non rattaché`);
            else avertissements.push(`entreprise « ${v.entreprise_nom || v.entreprise_siret} » introuvable : non rattaché`);
        }
        delete v.entreprise_siret; delete v.entreprise_nom;
        if (companyId) v.financing = 'PROFESSIONNEL';
        return { ligne, nom, statut: 'a_creer', avertissements, valeurs: v, company_id: companyId };
    });
}

const LIBELLES_ENTREPRISE = {
    name: 'nom', siret: 'SIRET', vat_number: 'n° TVA', naf_ape: 'code NAF', legal_status: 'forme juridique', date_creation: 'date de création',
    address: 'adresse', zip_code: 'code postal', town: 'ville', email: 'e-mail', phone: 'téléphone', opco: 'OPCO',
    representative_civ: 'civilité du référent', representative_first_name: 'prénom du référent', representative_name: 'nom du référent',
    representative_role: 'fonction du référent',
};

/**
 * Les lignes ENTREPRISES, une à une. `existantes` : [{ name, siret, zip_code }] ; `normaliser` :
 * normaliserEntreprise ; `reEmail` ; `erreurTva` : le contrôle du formulaire.
 */
function analyserEntreprises(lignes, { existantes = [], normaliser, reEmail, erreurTva }) {
    const cp = (v) => { const d = chiffres(v); return d.length === 5 ? d : null; };
    const deja = [...existantes.map((c) => ({ siret: chiffres(c.siret), nom: nomCanonique(c.name), cp: cp(c.zip_code), ligne: null }))];
    const memeEntreprise = (a, b) => (a.siret.length === 14 && a.siret === b.siret)
        || (!!a.nom && a.nom === b.nom && (!a.cp || !b.cp || a.cp === b.cp));

    return lignes.map((brute, i) => {
        const ligne = numero(brute, i);
        const avertissements = [];
        const v = normaliser(garder(brute, CHAMPS_ENTREPRISE));
        const nom = v.name || '';
        if (v.email && !reEmail.test(v.email)) { avertissements.push(`e-mail « ${v.email} » invalide : laissé de côté`); delete v.email; }
        if (v.siret !== undefined && !siretOk(v.siret)) { avertissements.push(`SIRET « ${v.siret} » illisible (14 chiffres) : laissé de côté`); delete v.siret; }
        if (v.vat_number && erreurTva(v.vat_number)) { avertissements.push(`n° TVA « ${v.vat_number} » invalide : laissé de côté`); delete v.vat_number; }
        if (v.representative_civ !== undefined) {
            const c = civilite(v.representative_civ);
            if (c) v.representative_civ = c; else { avertissements.push(`civilité du référent « ${v.representative_civ} » inconnue : laissée de côté`); delete v.representative_civ; }
        }
        if (v.date_creation !== undefined) {
            const d = lireDate(v.date_creation);
            if (d) v.date_creation = d; else { avertissements.push(`date de création « ${v.date_creation} » illisible (JJ/MM/AAAA) : laissée de côté`); delete v.date_creation; }
        }
        if (v.naf_ape) v.naf_ape = String(v.naf_ape).replace(/[\s.]/g, '').toUpperCase(); // « 56.10C » s'écrit « 5610C » ici
        largeurs(v, 'entreprise', avertissements, LIBELLES_ENTREPRISE);
        if (vide(v.name)) return { ligne, nom, statut: 'erreur', motif: 'nom de l\'entreprise requis', avertissements };

        const moi = { siret: chiffres(v.siret), nom: nomCanonique(v.name), cp: cp(v.zip_code), ligne };
        const autre = deja.find((d) => memeEntreprise(moi, d));
        if (autre) {
            const par = autre.siret.length === 14 && autre.siret === moi.siret ? 'ce SIRET' : 'ce nom, au même code postal';
            return { ligne, nom, statut: 'doublon', motif: autre.ligne ? `même entreprise que la ligne ${autre.ligne}` : `une fiche porte déjà ${par}`, avertissements };
        }
        deja.push(moi);
        return { ligne, nom, statut: 'a_creer', avertissements, valeurs: v };
    });
}

/** Les comptes d'un résultat, pour l'écran. */
function bilan(resultats) {
    const n = (s) => resultats.filter((r) => r.statut === s).length;
    return { a_creer: n('a_creer'), crees: n('cree'), doublons: n('doublon'), erreurs: n('erreur'),
        avertissements: resultats.filter((r) => r.avertissements.length).length };
}

module.exports = {
    MAX_LIGNES, CHAMPS_STAGIAIRE, CHAMPS_ENTREPRISE, STATUTS_PRO,
    civilite, situation, lireDate, nomCanonique, analyserStagiaires, analyserEntreprises, bilan,
};
