/**
 * L'ARBORESCENCE D'ARCHIVAGE — commune à toutes les formations (migration 182, demandée le
 * 2026-09-24) — et la place qu'elle donne à chaque document du coffre dans l'archive ZIP.
 *
 * UNE ARBORESCENCE POUR TOUTES LES FORMATIONS. Elle vivait sur chaque formation, à recomposer dix
 * fois à la main ; les trois formations réglées (RS7404, NIV1, NIV1H) avaient pourtant le même
 * squelette — {Année}/{Semaine}/{Code}/{Stagiaire}, et un sous-dossier « Évaluations ». Un document
 * qu'une formation n'a pas n'y est simplement pas mis : la place réservée à « Devis RS7404 » reste
 * vide dans l'archive de NIV1H, sans rien casser.
 *
 * DÉSIGNER UN DOCUMENT SANS DÉSIGNER UNE FORMATION. Un modèle (contrat, droit à l'image), une pièce,
 * une feuille d'émargement se désignent par leur identifiant : ils sont communs à l'organisme. Un QCM,
 * NON — chaque formation a son « Évaluation Formative du Mardi », avec son propre identifiant. Dans
 * l'arborescence commune, un QCM se désigne donc par son TITRE, et chaque formation y range le sien.
 * Les anciennes arborescences le désignaient par identifiant : elles restent lues telles quelles.
 *
 * CE QUE L'ARBORESCENCE NE NOMME PAS N'EST PAS PERDU. Un document du coffre qu'aucun dossier ne
 * réclame va dans le dossier du stagiaire (de l'entreprise, ou de la formation pour un document de
 * session) : une archive Qualiopi qui oublierait un document en silence serait pire qu'une archive
 * mal rangée.
 *
 * Du JavaScript pur, sans base : les tests l'éprouvent directement.
 */

const sansAccents = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Un titre comparable : sans accents, sans casse, espaces réduits. */
const normaliserTitre = (t) => sansAccents(t).toLowerCase().replace(/\s+/g, ' ').trim();

/** L'identité d'un document placé dans l'arborescence — la même quelle que soit la formation. */
function cleItem(it) {
    if (!it || typeof it !== 'object') return null;
    if (it.group) return `ou:${it.group}`;
    if (it.type === 'quiz' && it.titre) return `qcm:${normaliserTitre(it.titre)}`;
    if (it.ref) return `ref:${it.ref}`;
    return null;
}

/**
 * Les modèles qu'un item désigne (un « OU » en désigne plusieurs ; un QCM ou une pièce, aucun).
 *
 * UN « OU » SE LIT DANS SES MEMBRES D'AUJOURD'HUI (`groupes` : clé → { members }), pas dans ceux
 * enregistrés avec lui. Relevé en production le 2026-09-24 : NIV1 et NIV1H plaçaient le MÊME groupe
 * « Devis », mais l'un avait gardé « devis-entreprise », l'autre « devis-professionnel » — et les
 * dossiers d'entreprise emploient désormais « devis-professionnel-copie ». Lu dans l'instantané,
 * leur devis n'aurait trouvé sa place nulle part.
 */
function slugsDe(it, groupes) {
    if (!it) return [];
    if (it.group) {
        const actuel = groupes && groupes.get(it.group);
        const membres = actuel ? actuel.members : it.members;
        return Array.isArray(membres) ? membres.filter(Boolean) : [];
    }
    if (it.ref && !/^(quiz|piece|remise):/.test(it.ref)) return [it.ref];
    return [];
}

/**
 * Cet item désigne-t-il ce document du coffre ?
 * `doc` : { slug, quiz_id, quiz_title, piece_type_id } — ce que le coffre sait du document.
 */
function itemDesigne(it, doc, groupes) {
    if (!it || !doc) return false;
    if (it.group) return !!doc.slug && slugsDe(it, groupes).includes(doc.slug);
    if (it.type === 'quiz' && it.titre) {
        return !!doc.quiz_title && normaliserTitre(it.titre) === normaliserTitre(doc.quiz_title);
    }
    if (it.ref) {
        if (doc.quiz_id && it.ref === `quiz:${doc.quiz_id}`) return true;         // ancienne forme
        if (doc.piece_type_id && it.ref === `piece:${doc.piece_type_id}`) return true;
        return !!doc.slug && it.ref === doc.slug;
    }
    return false;
}

const aDesDossiers = (arbre) => !!(arbre && Array.isArray(arbre.folders) && arbre.folders.length);
const estParStagiaire = (d) => !!(d && d.per_learner);
const estEntreprise = (d) => /\{Entreprise\}/.test((d && d.name) || '');

/** Le chemin (dossiers, de la racine au dossier) du premier dossier qui répond au prédicat. */
function premierChemin(arbre, predicat) {
    const chercher = (dossiers, chemin) => {
        for (const d of dossiers || []) {
            const ici = [...chemin, d];
            if (predicat(d)) return ici;
            const sous = chercher(d.children, ici);
            if (sous) return sous;
        }
        return null;
    };
    return chercher(arbre && arbre.folders, []);
}

/** Le chemin du dossier où l'arborescence range ce document, ou null si elle ne le nomme pas. */
function placeDansArbre(arbre, doc, groupes) {
    return premierChemin(arbre, (d) => (d.items || []).some((it) => itemDesigne(it, doc, groupes)));
}

/* LES STRUCTURES STANDARD, quand rien n'est réglé — celles que proposait déjà l'éditeur. */
const STANDARD = { folders: [{ name: '{Année}', children: [{ name: '{Semaine}', children: [{ name: '{Code}', children: [
    { name: '{Stagiaire}', per_learner: true, items: [], children: [] }] }] }] }] };
const STANDARD_ENTREPRISE = { folders: [{ name: '{Année}', children: [{ name: '{Semaine}', children: [{ name: '{Code}', children: [
    { name: '{Entreprise}', children: [{ name: '{Stagiaire}', per_learner: true, items: [], children: [] }] }] }] }] }] };

/** Un nom de dossier ou de fichier que tous les systèmes acceptent. */
function nettoyer(s, repli = 'Sans nom') {
    const propre = String(s == null ? '' : s)
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')   // interdits par Windows, et « / » ferait un sous-dossier
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+|[.\s]+$/g, '')             // ni caché (« .x »), ni point final (refusé par Windows)
        .slice(0, 120)
        .trim();
    return propre || repli;
}

const jourMois = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}-${m[2]}` : null; };

/** Les champs d'un nom de dossier, pour ce document. */
function valeurChamp(champ, ctx) {
    switch (champ) {
        case 'Année': return ctx.annee != null && ctx.annee !== '' ? String(ctx.annee) : 'Sans année';
        /* « S02 » et non « S2 » : triés par nom, les dossiers d'une année restent dans l'ordre. */
        case 'Semaine': return ctx.semaine != null && ctx.semaine !== '' ? `S${String(ctx.semaine).padStart(2, '0')}` : 'Sans semaine';
        case 'Code': return ctx.code || 'Sans formation';
        case 'Formation': return ctx.formation || ctx.code || 'Sans formation';
        case 'Dates': {
            const a = jourMois(ctx.debut); const b = jourMois(ctx.fin);
            return a && b ? `${a}→${b}` : a || b || 'Sans dates';
        }
        case 'Stagiaire': return ctx.stagiaire || 'Sans nom';
        case 'Entreprise': return ctx.entreprise || 'Sans entreprise';
        default: return '';
    }
}
const resoudre = (nom, ctx) => String(nom || '').replace(/\{(Année|Semaine|Code|Formation|Dates|Stagiaire|Entreprise)\}/g,
    (_, champ) => valeurChamp(champ, ctx));

/** Ce que les champs valent pour ce document du coffre. */
function contexteDu(doc) {
    const personne = `${doc.last_name || ''} ${doc.first_name || ''}`.trim();
    return {
        annee: doc.year, semaine: doc.week, code: doc.program_code, formation: doc.program_title,
        debut: doc.debut, fin: doc.fin,
        stagiaire: doc.scope === 'LEARNER' ? personne : null,
        entreprise: doc.scope === 'COMPANY' ? (doc.company_name || personne || null) : (doc.enr_company_name || null),
    };
}

/**
 * L'arborescence qui range ce document. Un dossier arrivé par une ENTREPRISE (et les documents de
 * l'entreprise elle-même) suit l'arborescence entreprise quand elle existe ; tout le reste,
 * l'arborescence stagiaire. Sans aucune, la structure standard.
 * `arbres` : { stagiaire, entreprise } — l'une ou l'autre peut manquer.
 */
function arbrePour(arbres, doc) {
    const viaEntreprise = doc.scope === 'COMPANY' || !!doc.enr_company_id;
    if (viaEntreprise && aDesDossiers(arbres && arbres.entreprise)) return arbres.entreprise;
    if (aDesDossiers(arbres && arbres.stagiaire)) return arbres.stagiaire;
    return viaEntreprise ? STANDARD_ENTREPRISE : STANDARD;
}

/**
 * La place d'un document dans l'archive.
 * @param groupes les « OU » d'aujourd'hui (clé → { members }), cf. slugsDe
 * @returns {{ dossiers: string[], fichier: string, place: 'arbre' | 'defaut' }}
 *          `fichier` sans extension : c'est l'appelant qui connaît le type réel.
 */
function placeDansLArchive(arbres, doc, groupes) {
    const arbre = arbrePour(arbres, doc);
    const ctx = contexteDu(doc);
    let chemin = placeDansArbre(arbre, doc, groupes);
    let place = 'arbre';
    /* UNE PLACE INCOHÉRENTE AVEC LA NATURE DU DOCUMENT EST IGNORÉE : un document d'entreprise ou de
       session n'a pas de stagiaire, et ne peut donc pas se ranger dans un dossier « un par
       stagiaire » — il n'y aurait aucun nom à lui donner. */
    if (chemin && doc.scope !== 'LEARNER' && chemin.some(estParStagiaire)) chemin = null;
    if (chemin && doc.scope === 'SESSION' && chemin.some(estEntreprise)) chemin = null;
    if (!chemin) {
        place = 'defaut';
        const versStagiaire = premierChemin(arbre, estParStagiaire)
            || premierChemin(STANDARD, estParStagiaire);
        if (doc.scope === 'LEARNER') chemin = versStagiaire;
        else if (doc.scope === 'COMPANY') {
            /* L'entreprise a son dossier dans l'arborescence entreprise ; à défaut, on lui en crée
               un à côté des dossiers de stagiaires. */
            chemin = premierChemin(arbre, estEntreprise)
                || [...versStagiaire.slice(0, -1).filter((d) => !estEntreprise(d)), { name: '{Entreprise}' }];
        } else {
            // Document de SESSION : au niveau de la formation, au-dessus des stagiaires et des entreprises.
            const i = versStagiaire.findIndex((d) => estParStagiaire(d) || estEntreprise(d));
            chemin = versStagiaire.slice(0, i < 0 ? versStagiaire.length - 1 : i);
        }
    }
    const dossiers = chemin.map((d) => {
        let nom = resoudre(d.name, ctx);
        /* UN DOSSIER « UN PAR STAGIAIRE » SANS SON NOM (« Stagiaires ») rangerait tout le monde au
           même endroit : on lui ajoute le nom, pour que chacun garde le sien. */
        if (estParStagiaire(d) && !/\{Stagiaire\}/.test(d.name || '')) nom = `${nom} ${ctx.stagiaire || 'Sans nom'}`;
        return nettoyer(nom);
    });
    /* UN DOCUMENT DE STAGIAIRE RANGÉ AU-DESSUS DE SON DOSSIER (le droit à l'image de chacun, dans le
       dossier de l'entreprise) porte le nom de son stagiaire : sinon les droits à l'image de toute
       une entreprise s'écraseraient les uns les autres. */
    const horsDeSonDossier = doc.scope === 'LEARNER' && !chemin.some(estParStagiaire);
    const titre = doc.title || 'Document';
    const fichier = nettoyer(horsDeSonDossier && ctx.stagiaire ? `${titre} — ${ctx.stagiaire}` : titre, 'Document');
    return { dossiers, fichier, place };
}

/* ─── La proposition : les arborescences des formations, fusionnées ─────────────────────────── */

const nomDeDossier = (n) => normaliserTitre(n);
let compteur = 0;
const nouvelId = () => `f${Date.now().toString(36)}${(compteur++).toString(36)}`;

/**
 * La proposition d'arborescence commune : celles des formations, FUSIONNÉES — c'est le point de
 * départ que l'école relit une fois, au lieu de tout replacer.
 *
 * Deux dossiers de même nom au même niveau n'en font qu'un. Un document déjà placé par une formation
 * n'est pas placé une seconde fois : s'il l'était AILLEURS, c'est un CONFLIT, que la proposition
 * NOMME (la première formation l'emporte) au lieu de trancher en silence. Un item qui ne désigne plus
 * rien (un QCM supprimé, une étape qui n'existe plus) est RETIRÉ, et nommé lui aussi.
 *
 * @param entrees     [{ code, tree }] — dans l'ordre de préférence : la première gagne un conflit
 * @param titreDuQcm  (id) => le titre ACTUEL du QCM, ou null s'il n'existe plus
 * @param existe      (item) => l'item désigne-t-il encore un document de l'organisme ?
 * @param groupes     les « OU » d'aujourd'hui (clé → { members, label }) : un « OU » de la
 *                    proposition porte ses membres et son libellé ACTUELS
 * @param libelleDe   (modèle) => son libellé actuel : un « OU » qui n'existe plus se DÉPLIE en ses
 *                    modèles, un par un, à sa place (cf. actualiserLesOu)
 * @param homonymeDe  (nom) => le seul modèle actuel de ce nom : il remplace un membre disparu
 */
function fusionnerArbres(entrees, { titreDuQcm = () => null, existe = () => true, groupes = null, libelleDe = () => null,
    homonymeDe = () => null } = {}) {
    const racine = { children: [] };
    const parCle = new Map();   // clé d'item → { node, chemin }
    const parSlug = new Map();  // modèle → { node, item, chemin } (pour qu'un « OU » absorbe ses membres)
    const conflits = [];
    const retires = [];
    /* UN ANCIEN QCM, DÉSIGNÉ PAR SON IDENTIFIANT, PASSE PAR SON TITRE ACTUEL — pas par le libellé
       enregistré avec lui, qui a pu vieillir (NIV1 disait encore « … du Mardi - NIVEAU I »). */
    /* Un item enregistré, lu AUJOURD'HUI — une liste, car un « OU » supprimé en rend plusieurs. */
    const traduire = (it) => {
        if (it && !it.group && typeof it.ref === 'string' && it.ref.startsWith('quiz:')) {
            const titre = titreDuQcm(it.ref.slice(5));
            return titre ? [{ type: 'quiz', titre, label: titre }] : [null];
        }
        if (it && it.group && groupes) {
            const actuel = groupes.get(it.group);
            if (actuel) return [{ type: 'model', group: it.group, members: [...actuel.members], label: actuel.label || it.label }];
            // Le groupe n'existe plus : ses modèles, un par un, à sa place (et ceux qui n'existent plus, retirés).
            const depli = membresDuOu(it, libelleDe, homonymeDe)
                .map((m) => (m.slug ? { type: 'model', ref: m.slug, label: m.label } : { type: 'model', ref: m.nom, label: m.nom }));
            return depli.length ? depli : [null];
        }
        return [it];
    };
    const placer = (node, it, chemin, code) => {
        const cle = cleItem(it);
        const deja = parCle.get(cle);
        if (deja) {
            if (deja.node !== node) conflits.push({ label: it.label || cle, garde: deja.chemin.join(' / '), ecarte: chemin.join(' / '), code });
            return;
        }
        const chevauche = slugsDe(it, groupes).map((s) => parSlug.get(s)).filter(Boolean);
        const ailleurs = chevauche.find((p) => p.node !== node);
        if (ailleurs) {
            conflits.push({ label: it.label || cle, garde: ailleurs.chemin.join(' / '), ecarte: chemin.join(' / '), code });
            return;
        }
        if (chevauche.length) {
            if (!it.group) return; // déjà couvert, au même endroit, par un « OU » qui le contient
            // Le « OU » absorbe les modèles seuls qu'il contient, placés au même endroit.
            const absorbes = new Set(chevauche.map((p) => p.item).filter((x) => !x.group));
            node.items = node.items.filter((x) => !absorbes.has(x));
            for (const x of absorbes) parCle.delete(cleItem(x));
        }
        node.items.push(it);
        parCle.set(cle, { node, chemin });
        for (const s of slugsDe(it, groupes)) parSlug.set(s, { node, item: it, chemin });
    };
    const fusionner = (cible, source, cheminNoms, code) => {
        for (const d of source || []) {
            if (!d || !String(d.name || '').trim()) continue;
            let node = cible.children.find((x) => nomDeDossier(x.name) === nomDeDossier(d.name));
            if (!node) {
                node = { id: nouvelId(), name: String(d.name).trim(), per_learner: !!d.per_learner, items: [], children: [] };
                cible.children.push(node);
            } else if (d.per_learner) node.per_learner = true;
            const ici = [...cheminNoms, node.name];
            for (const brut of d.items || []) {
                for (const it of traduire(brut)) {
                    if (!it || !cleItem(it) || !existe(it)) {
                        retires.push({ label: (it && it.ref && it.label) || (brut && (brut.label || brut.ref || brut.group)) || '?', code });
                        continue;
                    }
                    placer(node, it, ici, code);
                }
            }
            fusionner(node, d.children, ici, code);
        }
    };
    for (const { code, tree } of entrees || []) fusionner(racine, tree && tree.folders, [], code);
    return { tree: { folders: racine.children }, conflits, retires };
}

/**
 * Les modèles d'un « OU » qui n'existe plus, lus aujourd'hui : chacun avec son libellé actuel ; s'il
 * n'existe plus, son homonyme actuel (le nom se lit dans le libellé du « OU », dans l'ordre des
 * membres) ; sinon rien, et son nom pour le dire.
 * @returns Array<{ slug, label, remplace? } | { slug: null, nom }>
 */
function membresDuOu(it, libelleDe, homonymeDe) {
    const membres = Array.isArray(it.members) ? it.members : [];
    const noms = String(it.label || '').split(' / ').map((x) => x.trim());
    const nomDe = (i) => (noms.length === membres.length && noms[i] ? noms[i] : null);
    return membres.map((slug, i) => {
        const label = libelleDe(slug);
        if (label) return { slug, label };
        const nom = nomDe(i);
        const homo = nom ? homonymeDe(nom) : null;
        if (homo && homo.slug !== slug) return { slug: homo.slug, label: homo.label, remplace: slug };
        return { slug: null, nom: nom || slug };
    });
}

/**
 * UNE ARBORESCENCE ENREGISTRÉE, LUE AVEC LES « OU » D'AUJOURD'HUI (2026-09-25).
 *
 * Un choix « OU » y est enregistré tel qu'il était le jour où l'école l'a placé : sa clé, ses membres,
 * son libellé. Relevé en production le jour même : l'école avait supprimé ses équivalences (Modèles →
 * Équivalences), et l'arborescence affichait encore « Devis particulier / Devis professionnel (OU) »
 * et « Contrat / Convention (OU) » — des choix qui n'existaient plus.
 *
 *   · le « OU » existe toujours → il prend ses membres et son libellé ACTUELS ;
 *   · il n'existe plus → il se DÉPLIE : ses modèles, un par un, À SA PLACE — l'école a supprimé un
 *     choix, pas les documents ni le rangement qu'elle leur avait donné. Un modèle déjà rangé ailleurs
 *     y reste (une place par document) ; un modèle qui n'existe plus est nommé, pas inventé.
 *   · SAUF S'IL A UN HOMONYME : relevé le même jour, le « OU » enregistré désignait « devis-professionnel »,
 *     qui n'existe plus — le devis professionnel d'aujourd'hui est « devis-professionnel-copie », même
 *     nom à l'écran (un slug ne se renomme plus : on duplique). Annoncer « Devis professionnel n'existe
 *     plus » aurait été FAUX pour qui le voit dans ses modèles. Le nom d'un membre se lit dans le libellé
 *     du « OU », fait de leurs noms dans l'ordre (« Devis particulier / Devis professionnel ») ; un
 *     modèle actuel de ce nom EXACT, et un seul, prend sa place — et c'est dit (`remplaces`).
 *
 * L'archive, elle, rangeait déjà juste en attendant : un « OU » disparu y retombe sur les membres
 * enregistrés avec lui (slugsDe), donc au même dossier. C'est l'ÉCRAN qui mentait.
 *
 * @param groupes    clé → { members, label } — les « OU » d'aujourd'hui
 * @param libelleDe  (modèle) => son libellé actuel, ou null s'il n'existe plus
 * @param homonymeDe (nom) => { slug, label } du SEUL modèle actuel de ce nom, sinon null
 * @returns {{ tree, ajustements: Array<{ label, dossier, documents: string[], perdus: string[],
 *            remplaces: Array<{ nom, ancien, nouveau }> }> }}
 */
function actualiserLesOu(tree, groupes, libelleDe, homonymeDe = () => null) {
    const ajustements = [];
    if (!tree || !Array.isArray(tree.folders)) return { tree, ajustements };
    const ranges = new Set();
    const relever = (fs) => (fs || []).forEach((f) => {
        for (const it of f.items || []) if (it && !it.group) { const k = cleItem(it); if (k) ranges.add(k); }
        relever(f.children);
    });
    relever(tree.folders);
    const refaire = (fs, chemin) => (fs || []).map((f) => {
        const ici = [...chemin, f.name];
        const items = [];
        for (const it of f.items || []) {
            if (!it || !it.group) { items.push(it); continue; }
            const actuel = groupes && groupes.get(it.group);
            if (actuel) { items.push({ ...it, members: [...actuel.members], label: actuel.label || it.label }); continue; }
            const documents = []; const perdus = []; const remplaces = [];
            for (const m of membresDuOu(it, libelleDe, homonymeDe)) {
                if (!m.slug) { perdus.push(m.nom); continue; }
                if (m.remplace) remplaces.push({ nom: m.label, ancien: m.remplace, nouveau: m.slug });
                const cle = `ref:${m.slug}`;
                if (ranges.has(cle)) continue; // déjà rangé ailleurs, seul : il y reste
                ranges.add(cle);
                items.push({ type: 'model', ref: m.slug, label: m.label });
                documents.push(m.label);
            }
            ajustements.push({ label: it.label || it.group, dossier: ici.join(' / '), documents, perdus, remplaces });
        }
        return { ...f, items, children: refaire(f.children, ici) };
    });
    return { tree: { ...tree, folders: refaire(tree.folders, []) }, ajustements };
}

/** Une arborescence enregistrée (chaîne JSON en base, ou déjà objet), ou null si illisible. */
function lireArbre(v) {
    if (v == null || v === '') return null;
    try {
        const t = typeof v === 'string' ? JSON.parse(v) : v;
        return t && Array.isArray(t.folders) ? t : null;
    } catch { return null; }
}

/* ─── Ce qu'on accepte d'enregistrer ─────────────────────────────────────────────────────────── */

/**
 * Une arborescence propre à enregistrer : seulement les champs connus, des noms non vides, une
 * taille raisonnable. Lève une erreur (`code: 'ARBRE_INVALIDE'`) qui dit ce qui ne va pas.
 */
function validerArbre(tree) {
    const faute = (m) => { const e = new Error(m); e.code = 'ARBRE_INVALIDE'; return e; };
    if (tree == null) return null;
    if (typeof tree !== 'object' || !Array.isArray(tree.folders)) throw faute('Arborescence illisible.');
    let dossiers = 0; let items = 0;
    const item = (it) => {
        if (!it || typeof it !== 'object') throw faute('Document illisible dans l\'arborescence.');
        const label = String(it.label || '').slice(0, 200);
        if (it.group) {
            return { type: 'model', group: String(it.group).slice(0, 120),
                members: (Array.isArray(it.members) ? it.members : []).map((m) => String(m).slice(0, 120)).slice(0, 20), label };
        }
        if (it.type === 'quiz' && it.titre) return { type: 'quiz', titre: String(it.titre).slice(0, 255), label: label || String(it.titre).slice(0, 200) };
        if (it.ref) return { type: it.type === 'quiz' ? 'quiz' : 'model', ref: String(it.ref).slice(0, 120), label };
        throw faute('Un document de l\'arborescence ne désigne rien.');
    };
    const dossier = (d, profondeur) => {
        if (profondeur > 12) throw faute('Arborescence trop profonde (12 niveaux au plus).');
        if (++dossiers > 300) throw faute('Arborescence trop grande (300 dossiers au plus).');
        const nom = String((d && d.name) || '').trim();
        if (!nom) throw faute('Nommez tous les dossiers de l\'arborescence avant d\'enregistrer.');
        const its = (Array.isArray(d.items) ? d.items : []).map(item);
        items += its.length;
        if (items > 1000) throw faute('Trop de documents placés (1000 au plus).');
        return {
            id: String(d.id || nouvelId()).slice(0, 40), name: nom.slice(0, 120), per_learner: !!d.per_learner,
            items: its, children: (Array.isArray(d.children) ? d.children : []).map((c) => dossier(c, profondeur + 1)),
        };
    };
    return { folders: tree.folders.map((d) => dossier(d, 1)) };
}

module.exports = {
    normaliserTitre, cleItem, slugsDe, itemDesigne, placeDansArbre, placeDansLArchive, arbrePour, contexteDu,
    resoudre, nettoyer, fusionnerArbres, validerArbre, aDesDossiers, lireArbre, actualiserLesOu, STANDARD, STANDARD_ENTREPRISE,
};
