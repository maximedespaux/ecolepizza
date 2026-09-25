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
 * CE QUE L'ARBORESCENCE NE RANGE PAS N'EST PAS ARCHIVÉ (décidé par l'école le 2026-09-25 — cf.
 * placesDansLArchive) : ne pas placer un document, c'est choisir de ne pas en garder de copie. Mais
 * jamais EN SILENCE : l'aperçu de l'arborescence le dit, `_sommaire.txt` le nomme. Et la règle ne vise
 * que ce que l'école a pu placer — un PDF importé, un document hors parcours gardent leur place par
 * défaut, dans le dossier du stagiaire (de l'entreprise, ou de la formation pour un document de session).
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

/** Les clés par lesquelles l'arborescence désigne ce document du coffre (cf. cleItem, cleEtape). */
function clesDuDocument(doc) {
    const cles = [];
    if (doc.quiz_title) cles.push(`qcm:${normaliserTitre(doc.quiz_title)}`);
    if (doc.piece_type_id) cles.push(`ref:piece:${doc.piece_type_id}`);
    if (doc.slug) cles.push(`ref:${doc.slug}`);
    return cles;
}

/** Le chemin où CET arbre range ce document — remonté au-dessus d'un dossier qui ne lui convient pas —, ou null. */
function placeDansUnArbre(arbre, doc, groupes) {
    let chemin = placeDansArbre(arbre, doc, groupes);
    if (!chemin) return null;
    /* UNE PLACE QUI NE CONVIENT PAS À LA NATURE DU DOCUMENT SE REMONTE : un document d'entreprise ou
       de session n'a pas de stagiaire, il ne peut pas se ranger dans un dossier « un par stagiaire »
       — il n'y aurait aucun nom à lui donner ; il va juste au-dessus. Il partait autrefois au dossier
       par défaut ; depuis que « non rangé » veut dire « pas archivé », l'ignorer trahirait le choix
       de l'école, qui l'a placé. */
    const couper = (predicat) => { const i = chemin.findIndex(predicat); if (i >= 0) chemin = chemin.slice(0, i); };
    if (doc.scope !== 'LEARNER') couper(estParStagiaire);
    if (doc.scope === 'SESSION') couper(estEntreprise);
    return chemin;
}

/** La place par défaut : le dossier du stagiaire, de l'entreprise, ou de la formation (document de session). */
function placeParDefaut(arbre, doc) {
    const versStagiaire = premierChemin(arbre, estParStagiaire) || premierChemin(STANDARD, estParStagiaire);
    if (doc.scope === 'LEARNER') return versStagiaire;
    if (doc.scope === 'COMPANY') {
        /* L'entreprise a son dossier dans l'arborescence entreprise ; à défaut, on lui en crée un à
           côté des dossiers de stagiaires. */
        return premierChemin(arbre, estEntreprise)
            || [...versStagiaire.slice(0, -1).filter((d) => !estEntreprise(d)), { name: '{Entreprise}' }];
    }
    // Document de SESSION : au niveau de la formation, au-dessus des stagiaires et des entreprises.
    const i = versStagiaire.findIndex((d) => estParStagiaire(d) || estEntreprise(d));
    return versStagiaire.slice(0, i < 0 ? versStagiaire.length - 1 : i);
}

/** Un chemin de dossiers (ceux de l'arbre) devenu des noms : les dossiers résolus, et le nom du fichier. */
function enPlace(chemin, doc, place, arbre) {
    const ctx = contexteDu(doc);
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
    return { dossiers, fichier, place, arbre };
}

/**
 * LES PLACES D'UN DOCUMENT DANS L'ARCHIVE : aucune, une ou deux (2026-09-25).
 *
 * CE QUI N'EST PAS RANGÉ N'EST PAS ARCHIVÉ — décidé par l'école le 2026-09-25 : un document qu'elle
 * ne place pas, c'est qu'elle n'en veut pas de copie. Jusque-là, un document qu'aucun dossier ne
 * nommait partait dans le dossier du stagiaire, pour que rien ne se perde en silence ; l'aperçu
 * annonçait « 13 documents de RS7404 ne sont nommés nulle part : ils iront dans le dossier du
 * stagiaire », et c'était précisément ce qu'elle ne voulait pas. Le silence reste interdit : l'aperçu
 * le dit avant, `_sommaire.txt` le nomme après.
 *
 * LA RÈGLE NE VISE QUE CE QUE L'ÉCOLE A PU PLACER : ce que l'arborescence propose pour la formation
 * du document (`offerts`, la liste même de l'aperçu). Un PDF importé, un document généré hors de tout
 * parcours, celui d'une formation inconnue n'y figurent pas : ne pas les placer n'est pas un choix, et
 * ils gardent leur place par défaut. De même, une arborescence que l'école n'a pas réglée (aucun
 * dossier) n'exclut rien : l'archive suit alors la structure standard.
 *
 * DEUX ARBORESCENCES, DEUX RÔLES :
 *   · STAGIAIRE — le dossier de CHAQUE stagiaire, inscrit seul ou par une entreprise, et les
 *     documents de session ;
 *   · ENTREPRISE — des COPIES, pour l'entreprise, des documents de ses stagiaires qu'on y range ; et la
 *     seule place des documents de l'entreprise elle-même (la convention de groupe).
 * L'arborescence entreprise rangeait auparavant le dossier ENTIER d'un stagiaire inscrit par une
 * entreprise, à la place de l'arborescence stagiaire. En production, elle ne range que ses
 * évaluations : sous la règle ci-dessus, contrats et devis de ces stagiaires seraient sortis de
 * l'archive — alors que l'école les a rangés, côté stagiaire.
 *
 * @param arbres  { stagiaire, entreprise } — l'une ou l'autre peut manquer
 * @param groupes les « OU » d'aujourd'hui (clé → { members }), cf. slugsDe
 * @param offerts { stagiaire: Set, entreprise: Set } — ce que la formation propose de ranger dans
 *                chaque arbre (offertsDesFormations) ; null, inconnu : rien n'est exclu
 * @returns [{ dossiers, fichier, place: 'arbre' | 'defaut', arbre: 'stagiaire' | 'entreprise' }] —
 *          `fichier` sans extension : c'est l'appelant qui connaît le type réel.
 */
function placesDansLArchive(arbres, doc, groupes, offerts = null) {
    const stagiaire = arbres && arbres.stagiaire;
    const entreprise = arbres && arbres.entreprise;
    const propose = (liste) => !!liste && clesDuDocument(doc).some((c) => liste.has(c));
    const places = [];
    /* Range le document dans cet arbre ; s'il ne l'y nomme pas, à sa place par défaut — sauf `repli`
       nul : c'est alors que l'école a choisi de ne pas l'y mettre. */
    const ranger = (arbre, nom, repli) => {
        const chemin = placeDansUnArbre(arbre, doc, groupes);
        if (chemin) places.push(enPlace(chemin, doc, 'arbre', nom));
        else if (repli) places.push(enPlace(placeParDefaut(repli, doc), doc, 'defaut', nom));
    };
    if (doc.scope === 'COMPANY') {
        if (aDesDossiers(entreprise)) ranger(entreprise, 'entreprise', propose(offerts && offerts.entreprise) ? null : entreprise);
        // Rien de réglé pour l'entreprise : son document suit l'arborescence stagiaire, et rien n'est exclu.
        else if (aDesDossiers(stagiaire)) ranger(stagiaire, 'stagiaire', stagiaire);
        else ranger(STANDARD_ENTREPRISE, 'entreprise', STANDARD_ENTREPRISE);
        return places;
    }
    if (aDesDossiers(stagiaire)) ranger(stagiaire, 'stagiaire', propose(offerts && offerts.stagiaire) ? null : stagiaire);
    else ranger(STANDARD, 'stagiaire', STANDARD);
    // La COPIE pour l'entreprise : ce qu'on y a rangé, et rien d'autre — pas de place par défaut.
    if (doc.scope === 'LEARNER' && doc.enr_company_id && aDesDossiers(entreprise)) ranger(entreprise, 'entreprise', null);
    return places;
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

/* ─── La palette : ce que chaque formation a, pour ses DEUX arrivées ─────────────────────────── */

/** La clé d'une étape de parcours : celle de l'item qui la range (cf. cleItem) — un QCM par son titre. */
const cleEtape = (s) => (s.quiz_id ? `qcm:${normaliserTitre(s.label)}` : `ref:${s.slug}`);

/** Le volet entreprise d'une formation (`company_steps`) : chaîne JSON en base, ou déjà liste. */
function lireVolet(v) {
    let liste = v;
    if (typeof liste === 'string') { try { liste = JSON.parse(liste); } catch { liste = null; } }
    return Array.isArray(liste) ? liste.filter((s) => typeof s === 'string' && s) : [];
}

/**
 * LA PALETTE DE L'ARBORESCENCE COMMUNE, et ce que chaque formation y a (2026-09-25).
 *
 * UNE FORMATION A DEUX PARCOURS : celui du dossier (ses étapes actives), et son VOLET ENTREPRISE
 * (`training_program.company_steps`), qui le REMPLACE quand une entreprise inscrit ses stagiaires
 * (lib/parcours.js, companyParcours). Un document choisi dans le volet sans être actif dans le
 * parcours du dossier n'existe QUE pour ces inscriptions — c'est ainsi que l'école réserve son devis
 * professionnel aux entreprises.
 *
 * LA PALETTE NE LISAIT QUE LE PREMIER. Relevé en production le 2026-09-25 : « Devis professionnel »,
 * un document de GROUPE, inactif dans le parcours de chaque formation et choisi dans le volet entreprise
 * de NIV1H et NIV2, n'était proposé NULLE PART — pas même dans l'arborescence entreprise, sa seule place. Tant qu'un choix « OU » l'emportait
 * avec le devis particulier, rien ne se voyait ; l'école a supprimé ce « OU » pour ranger les deux devis
 * séparément, et n'a plus trouvé le second.
 *
 * L'ARRIVÉE PAR ENTREPRISE se lit comme companyParcours la calcule : les étapes du volet, actives ou
 * non ; et si le volet est vide, ou ne désigne que des étapes disparues (NIV1 ne cite plus que
 * « devis-entreprise », un modèle supprimé), le parcours du dossier — c'est là qu'il retombe.
 *
 * ET LES DOCUMENTS DE SESSION, qu'aucun parcours ne porte : « Contrat Hygiène », signé par
 * l'intervenant externe, s'envoie depuis la page de la session (documentSession.controller.js,
 * modelesExternes) — un par session, pour n'importe quelle formation. Relevé en production le même
 * jour : le coffre en avait un, et la liste ne le proposait pas. Chaque formation les a donc tous
 * (`documents_session`).
 *
 * @param entrees [{ id, code, title, etapes, volet }] — `etapes` : toutes les étapes candidates de la
 *        formation, avec `active` (formationSteps) ; `volet` : ses company_steps, dans l'ordre.
 * @param documentsDeSession [{ slug, label, doc_type }] — les modèles qu'on envoie depuis une session
 * @returns {{ documents, formations }}
 *   documents  [{ cle, slug | titre_qcm, label, company_level, doc_type, formations, formations_entreprise, session? }] :
 *              `formations`, celles qui l'ont dans le parcours du dossier ; `formations_entreprise`,
 *              celles qui l'ont à l'arrivée par entreprise ; `session`, un document de session ;
 *   formations [{ id, code, title, documents, documents_entreprise, documents_session }], en clés.
 */
function paletteDesFormations(entrees, documentsDeSession = []) {
    const palette = new Map();
    const formations = [];
    const entree = (s) => {
        const cle = cleEtape(s);
        if (!palette.has(cle)) {
            palette.set(cle, { cle, slug: s.slug, label: s.label, company_level: !!s.company_level, doc_type: s.doc_type || null, formations: [], formations_entreprise: [] });
        }
        return palette.get(cle);
    };
    /* LES ÉVALUATIONS (QCM) NE S'ARCHIVENT PLUS (2026-09-25, cf. sansEvaluations) : la liste ne les
       propose pas, et aucune formation ne les « a » pour l'aperçu. */
    const archivable = (s) => !s.quiz_id;
    const ajouter = (liste, code) => { if (!liste.includes(code)) liste.push(code); };
    const deSession = [];
    for (const m of documentsDeSession || []) {
        if (!m || !m.slug) continue;
        const e = entree({ slug: m.slug, label: m.label || m.slug, doc_type: m.doc_type, quiz_id: null, company_level: false });
        e.session = true;
        if (!deSession.includes(e.cle)) deSession.push(e.cle);
    }
    for (const f of entrees || []) {
        const etapes = Array.isArray(f.etapes) ? f.etapes : [];
        const actives = etapes.filter((s) => s.active);
        const parSlug = new Map(etapes.map((s) => [s.slug, s]));
        const duVolet = lireVolet(f.volet).map((sl) => parSlug.get(sl)).filter(Boolean);
        /* LE REPLI SE DÉCIDE SUR LE VOLET ENTIER, comme companyParcours : un volet fait de seuls QCM n'est
           pas vide pour lui. Les évaluations ne sont écartées qu'ensuite. */
        const parEntreprise = (duVolet.length ? duVolet : actives).filter(archivable);
        const siennes = actives.filter(archivable);
        for (const s of siennes) ajouter(entree(s).formations, f.code);
        for (const s of parEntreprise) ajouter(entree(s).formations_entreprise, f.code);
        formations.push({
            id: f.id, code: f.code, title: f.title,
            documents: [...new Set(siennes.map(cleEtape))],
            documents_entreprise: [...new Set(parEntreprise.map(cleEtape))],
            documents_session: deSession,
        });
    }
    /* Les documents des formations d'abord, dans l'ordre des parcours ; ceux de session ensuite. */
    const rang = (d) => (d.formations.length || d.formations_entreprise.length ? 0 : 1);
    return { documents: [...palette.values()].sort((a, b) => rang(a) - rang(b)), formations };
}

/** Un QCM placé dans une arborescence : par son titre, ou par son identifiant (les anciennes). */
const estEvaluation = (it) => !!it && !it.group && (it.type === 'quiz' || /^quiz:/.test(String(it.ref || '')));

/**
 * LES ÉVALUATIONS NE S'ARCHIVENT PLUS — décidé par l'école le 2026-09-25. Un QCM n'est pas un
 * document : aucun modèle, aucun PDF. Le coffre l'ouvrait sur « Aucun modèle », et l'archive ZIP
 * rangeait les 31 réponses de production en « NON inclus » : les dossiers « Évaluations » que l'école
 * avait placés dans ses deux arborescences restaient vides. Ses réponses, figées, vivent dans
 * Résultats QCM. Le coffre ne les liste plus (suivi.controller.js, lignesDuCoffre) ; ceci retire leurs
 * places des arborescences, et dit lesquelles, et où — rien n'est gardé sans que l'école enregistre.
 * @returns {{ tree, retirees: [{ label, dossier }] }}
 */
function sansEvaluations(tree) {
    const retirees = [];
    const refaire = (dossiers, chemin) => (dossiers || []).map((f) => {
        const ici = [...chemin, f.name];
        const items = [];
        for (const it of f.items || []) {
            if (estEvaluation(it)) retirees.push({ label: it.label || it.titre || it.ref, dossier: ici.join(' / ') });
            else items.push(it);
        }
        return { ...f, items, children: refaire(f.children, ici) };
    });
    return { tree: tree && Array.isArray(tree.folders) ? { ...tree, folders: refaire(tree.folders, []) } : tree, retirees };
}

/**
 * CE QUE CHAQUE FORMATION PROPOSE DE RANGER, arbre par arbre — la liste même que l'aperçu de
 * l'arborescence dit « non rangée » (src/app/ui/lib/arborescence.js, formationDansLArbre), pour que
 * l'archive exclue exactement ce que l'écran a annoncé :
 *   · stagiaire : tout ce qu'ont ses dossiers, inscrits seuls ou par une entreprise, et ses documents
 *     de session — sauf les documents de groupe (🏢), qui ne se rangent pas côté stagiaire ;
 *   · entreprise : ses documents de groupe. Ceux de ses stagiaires n'y sont que des copies, facultatives.
 * @param palette le résultat de paletteDesFormations
 * @returns Map code de formation → { stagiaire: Set, entreprise: Set } (des clés, cf. clesDuDocument)
 */
function offertsDesFormations(palette) {
    const deGroupe = new Set(((palette && palette.documents) || []).filter((d) => d.company_level).map((d) => d.cle));
    return new Map(((palette && palette.formations) || []).map((f) => {
        const tous = [...new Set([...(f.documents || []), ...(f.documents_entreprise || [])])];
        const stagiaire = [...new Set([...tous, ...(f.documents_session || [])])].filter((c) => !deGroupe.has(c));
        return [f.code, { stagiaire: new Set(stagiaire), entreprise: new Set(tous.filter((c) => deGroupe.has(c))) }];
    }));
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
    normaliserTitre, cleItem, slugsDe, itemDesigne, placeDansArbre, placesDansLArchive, clesDuDocument, contexteDu,
    resoudre, nettoyer, fusionnerArbres, validerArbre, aDesDossiers, lireArbre, actualiserLesOu, STANDARD, STANDARD_ENTREPRISE,
    cleEtape, lireVolet, paletteDesFormations, offertsDesFormations, sansEvaluations,
};
