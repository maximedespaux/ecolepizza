// Catalogue de jetons — SOURCE UNIQUE DE VÉRITÉ.
//
// Chaque jeton est défini une seule fois, rattaché à une « table » (Stagiaire,
// Formation, Session…). Ce même catalogue alimente :
//   · la palette de l'éditeur de document (glisser-déposer, regroupé par table) ;
//   · le moteur de rendu (resolveTokens) qui remplace {Jeton} par la valeur réelle.
// Ainsi un jeton ne peut pas être mal orthographié : on le choisit, on ne le tape pas.
//
// Les clés conservent l'orthographe historique des anciens modèles Word pour rester
// rétro-compatibles ({Personne}, {Niveau suggérer}, {Nom entreprise}…).

const { resolveCustomTokens, shiftDate } = require('./customtokens.js');

// --- Formatage ---
const pad = (n) => String(n).padStart(2, '0');
function frDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function euro(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return '';
    return n.toLocaleString('fr-FR') + ' €';
}
function businessDay(startStr, offset) {
    if (!startStr) return '';
    const d = new Date(startStr);
    if (Number.isNaN(d.getTime())) return '';
    let added = 0;
    while (added < offset) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) added += 1;
    }
    return frDate(d);
}

// --- Catalogue (regroupé par table), tel qu'affiché dans la palette ---
// group  : table d'origine (libellé lisible)
// tokens : { key: clé du jeton, label: libellé lisible, sample: exemple d'aperçu }
const TOKEN_CATALOG = [
    {
        group: 'Stagiaire',
        tokens: [
            { key: 'Personne', label: 'Nom complet', sample: 'M. Jean Dupont' },
            { key: 'Civilité', label: 'Civilité', sample: 'M.' },
            { key: 'Prénom', label: 'Prénom', sample: 'Jean' },
            { key: 'Nom', label: 'Nom', sample: 'Dupont' },
            { key: 'Adresse', label: 'Adresse complète', sample: '12 rue des Fours, 33000 Bordeaux' },
            { key: 'CP', label: 'Code postal', sample: '33000' },
            { key: 'Ville', label: 'Ville', sample: 'Bordeaux' },
            { key: 'Email', label: 'E-mail', sample: 'jean.dupont@email.fr' },
            { key: 'Téléphone', label: 'Téléphone', sample: '06 12 34 56 78' },
            { key: 'D_Naissance', label: 'Date de naissance', sample: '15/04/1990' },
            { key: 'Lieu naissance', label: 'Lieu de naissance', sample: 'Toulouse' },
            { key: 'Statut', label: 'Statut professionnel', sample: "Demandeur d'emploi" },
            { key: 'France Travail', label: 'Identifiant France Travail', sample: '1234567A' },
        ],
    },
    {
        group: 'Formation',
        tokens: [
            { key: 'Formation', label: 'Intitulé', sample: 'Fabriquer des pizzas artisanales' },
            { key: 'Code', label: 'Code formation', sample: 'RS7404' },
            { key: 'Public', label: 'Public visé', sample: 'Tout public' },
            { key: 'Objectifs', label: 'Objectifs', sample: 'Maîtriser la pâte, la cuisson…' },
            { key: 'ObjectifG', label: 'Objectif général', sample: 'Devenir pizzaïolo autonome' },
            { key: 'DuréeDétail', label: 'Durée (détail)', sample: '35 h sur 5 jours' },
            { key: 'Déroulé', label: 'Programme / déroulé', sample: 'Jour 1 : la pâte…' },
            { key: 'Heures', label: 'Nombre d’heures', sample: '35' },
            { key: 'Jours', label: 'Nombre de jours', sample: '5' },
            { key: 'PrixFormation', label: 'Prix catalogue', sample: '1 500 €' },
        ],
    },
    {
        group: 'Session',
        tokens: [
            { key: 'Jour1', label: 'Date de début', sample: '02/06/2025' },
            { key: 'endDate', label: 'Date de fin', sample: '06/06/2025' },
            { key: 'Semaine', label: 'Semaine / année', sample: 'Semaine 23 — 2025' },
            { key: 'Formateur', label: 'Formateur', sample: 'Marc Leblanc' },
            { key: 'Lundi', label: 'Date — Lundi (jour 1)', sample: '02/06/2025' },
            { key: 'Mardi', label: 'Date — Mardi (jour 2)', sample: '03/06/2025' },
            { key: 'Mercredi', label: 'Date — Mercredi (jour 3)', sample: '04/06/2025' },
            { key: 'Jeudi', label: 'Date — Jeudi (jour 4)', sample: '05/06/2025' },
            { key: 'Vendredi', label: 'Date — Vendredi (jour 5)', sample: '06/06/2025' },
        ],
    },
    {
        group: 'Dossier',
        tokens: [
            { key: 'Financement', label: 'Financement', sample: 'CPF' },
            { key: 'Prix', label: 'Prix du dossier', sample: '1 500 €' },
            { key: 'Acompte', label: 'Acompte', sample: '450 €' },
            { key: 'Reste à payer', label: 'Reste à payer (prix − acompte)', sample: '1 050 €' },
            { key: 'Prix HT', label: 'Prix HT', sample: '1 500 €' },
            { key: 'TVA', label: 'Montant de la TVA', sample: '0 €' },
            { key: 'Taux TVA', label: 'Taux de TVA', sample: 'Exonérée' },
            { key: 'Prix TTC', label: 'Prix TTC', sample: '1 500 €' },
        ],
    },
    {
        group: 'Entreprise',
        tokens: [
            { key: 'Nom entreprise', label: 'Raison sociale', sample: 'Pizza Napoli SARL' },
            { key: 'Siret', label: 'SIRET', sample: '123 456 789 00012' },
            { key: 'OPCO', label: 'OPCO', sample: 'AKTO' },
            { key: 'Civ représentant', label: 'Civilité du représentant', sample: 'Mme' },
            { key: 'Nom représentant', label: 'Nom du représentant', sample: 'Sophie Martin' },
            { key: 'Fonction représentant', label: 'Fonction du représentant', sample: 'Gérante' },
            { key: 'Adresse entreprise', label: 'Adresse de l’entreprise', sample: '5 av. de la Gare, 33000 Bordeaux' },
            { key: 'Email entreprise', label: 'E-mail de l’entreprise', sample: 'contact@pizzanapoli.fr' },
            { key: 'Téléphone entreprise', label: 'Téléphone de l’entreprise', sample: '05 56 11 22 33' },
            { key: 'NAF entreprise', label: 'Code NAF/APE', sample: '5610C' },
            { key: 'Forme juridique', label: 'Forme juridique', sample: 'SARL' },
            { key: 'Stagiaires', label: 'Liste des stagiaires (groupe, un par ligne)', sample: 'M. Jean DUPONT\nMme Marie MARTIN' },
        ],
    },
    {
        group: 'Financeur (OPCO)',
        tokens: [
            { key: 'Nom financeur', label: 'Nom du financeur', sample: 'AKTO' },
            { key: 'SIRET financeur', label: 'SIRET du financeur', sample: '180 020 016 00019' },
            { key: 'Adresse financeur', label: 'Adresse du financeur', sample: "1 rue de l'OPCO, 75001 Paris" },
            { key: 'Email financeur', label: 'E-mail du financeur', sample: 'contact@akto.fr' },
            { key: 'Téléphone financeur', label: 'Téléphone du financeur', sample: '01 44 00 00 00' },
        ],
    },
    {
        group: 'Organisme',
        tokens: [
            { key: 'Organisme', label: 'Nom de l’organisme', sample: 'École Pizzaïolo Despaux' },
            { key: 'Organisme court', label: 'Nom court', sample: 'Impasto' },
            { key: 'Responsable', label: 'Responsable', sample: 'Jean-Jacques Despaux' },
            { key: 'Siret organisme', label: 'SIRET', sample: '987 654 321 00019' },
            { key: 'TVA organisme', label: 'N° TVA', sample: 'FR76987654321' },
            { key: 'NDA', label: 'N° déclaration d’activité', sample: '75330000000' },
            { key: 'Adresse organisme', label: 'Adresse', sample: '1 rue du Four, 33000 Bordeaux' },
            { key: 'Ville organisme', label: 'Ville', sample: 'Bordeaux' },
            { key: 'Téléphone organisme', label: 'Téléphone', sample: '05 56 00 00 00' },
            { key: 'Email organisme', label: 'E-mail', sample: 'contact@ecole-pizza.fr' },
            { key: 'IBAN', label: 'IBAN (RIB)', sample: 'FR76 3000 4000 0100 0001 2345 678' },
            { key: 'BIC', label: 'BIC / SWIFT', sample: 'AGRIFRPP' },
            { key: 'Banque', label: 'Domiciliation bancaire', sample: 'Crédit Agricole' },
        ],
    },
    {
        group: 'Dates',
        tokens: [
            { key: 'Date', label: 'Date du jour', sample: '06/07/2026' },
        ],
    },
    {
        group: 'Signature',
        tokens: [
            { key: 'Signature stagiaire', label: 'Signature du stagiaire', sample: '✍ (signée à la signature)' },
            { key: 'Signature organisme', label: "Signature de l'organisme", sample: '✍ (image enregistrée)' },
            { key: 'Nom signataire', label: 'Nom du signataire', sample: 'M. Jean Dupont' },
            { key: 'Date signature', label: 'Date de signature', sample: '06/07/2026' },
        ],
    },
];

// Jetons dont la valeur est du HTML (image de signature, tableau) : insérés SANS échappement.
const RAW_TOKENS = new Set(['Signature stagiaire', 'Signature organisme', 'Stagiaires']);

// Échappement minimal pour insérer du texte dans une cellule HTML (jeton {Stagiaires}).
const escCell = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Liste des stagiaires d'un groupe (document « entreprise »), un par ligne :
//   M. Jean DUPONT
//   Mme Marie MARTIN
// Le jeton {Stagiaires} est RAW (HTML injecté) : les lignes sont séparées par <br>
// pour un rendu identique en aperçu HTML et en .docx (LibreOffice).
function stagiairesTable(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return '<i>Aucun stagiaire dans le groupe.</i>';
    return rows
        .map((s) => escCell([s.civility, s.first_name, s.last_name].filter(Boolean).join(' ')))
        .join('<br>');
}

// Jetons disponibles POUR CHAQUE stagiaire à l'intérieur d'un bloc {#Stagiaires}…{/Stagiaires}.
// (Mêmes noms que les jetons stagiaire globaux, mais résolus par stagiaire du groupe.)
function stagiaireRowTokens(s, i) {
    const full = [s.civility, s.first_name, s.last_name].filter(Boolean).join(' ').trim();
    return {
        'N°': String(i + 1),
        Personne: full, 'Civilité': s.civility || '', Nom: s.last_name || '', 'Prénom': s.first_name || '',
        Email: s.email || '', 'Téléphone': s.phone || '', OPCO: s.opco || '',
        Ville: s.town || '', Adresse: s.address || '', CP: s.zip_code || '',
        'Lieu naissance': s.birth_place || '', D_Naissance: frDate(s.birthday), Naissance: frDate(s.birthday),
    };
}

// Développe les blocs répétés « par stagiaire du groupe » AVANT le remplacement normal :
//   {#Stagiaires} M. {Prénom} {Nom} — {OPCO}<br> {/Stagiaires}
// Le contenu entre les marqueurs est répété pour chaque stagiaire, en résolvant les
// jetons PAR STAGIAIRE (cf. stagiaireRowTokens) ET les jetons PERSONNALISÉS
// ({custom:…}) recalculés par stagiaire. Les autres jetons ({Formation}, signatures…)
// restent tels quels et sont résolus ensuite globalement.
function expandGroupBlocks(html, list, customDefs, globalValues) {
    const rows = Array.isArray(list) ? list : [];
    const defs = Array.isArray(customDefs) ? customDefs : [];
    const gv = globalValues || {};
    return String(html || '').replace(/\{#\s*Stagiaires\s*\}([\s\S]*?)\{\/\s*Stagiaires\s*\}/g, (m, tpl) => {
        if (!rows.length) return '<i>Aucun stagiaire dans le groupe.</i>';
        return rows.map((s, i) => {
            const row = stagiaireRowTokens(s, i);
            // Jetons personnalisés recalculés pour CE stagiaire (peuvent référencer les
            // jetons par stagiaire ET les jetons globaux).
            const custom = resolveCustomTokens(defs, { ...gv, ...row });
            const repl = { ...row, ...custom };
            // On ne remplace QUE les jetons par stagiaire / personnalisés ; les jetons
            // purement globaux sont laissés au remplacement global (fillHtml).
            return String(tpl).replace(/\{\s*([^{}|]+?)\s*(?:\|\s*([+-]?\d+)\s*)?\}/g, (mm, ref, off) => {
                if (!(ref in repl)) return mm;
                let v = repl[ref] == null ? '' : String(repl[ref]);
                if (off) v = shiftDate(v, parseInt(off, 10));
                return escCell(v);
            });
        }).join('');
    });
}
// Retire les blocs {#Stagiaires}…{/Stagiaires} (pour l'analyse « jetons manquants » :
// leur contenu est résolu par stagiaire, pas globalement).
const stripGroupBlocks = (s) => String(s || '').replace(/\{#\s*Stagiaires\s*\}[\s\S]*?\{\/\s*Stagiaires\s*\}/g, '');

// Rend une image de signature (ou un emplacement en pointillés si absente).
// Cadre de signature à TAILLE FIXE : l'image (dessin du stagiaire ou signature de
// l'organisme) est contenue dans une boîte de dimensions constantes, quelle que soit
// sa taille d'origine — la mise en page ne bouge pas. Le cadre vide (non signé) a la
// même taille pour un rendu identique.
const SIG_W = 200; // largeur par défaut du cadre de signature (px)
const SIG_H = 64;  // hauteur par défaut du cadre de signature (px)
// GIF 1×1 transparent : sert de « gabarit » dimensionné (width/height HTML) pour le
// cadre vide. LibreOffice IGNORE la largeur CSS d'un <span>/<td> mais RESPECTE les
// attributs width/height d'une <img> — d'où un cadre porté par une image.
const SPACER_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
// Cadre de signature dimensionné par les attributs width/height d'une <img> (seule
// forme respectée au rendu PDF). `w`/`h` (px) facultatifs — défaut SIG_W × SIG_H.
// Empreinte identique que le cadre soit signé ou vide (la mise en page ne bouge pas).
function signatureBox(dataUrl, label, w, h) {
    const bw = w || SIG_W, bh = h || SIG_H;
    if (dataUrl && /^data:image\//.test(dataUrl)) {
        return `<img src="${dataUrl}" alt="${label}" width="${bw}" height="${bh}" `
            + `style="max-width:100%;object-fit:contain;vertical-align:middle" />`;
    }
    return `<img src="${SPACER_GIF}" alt="${label}" width="${bw}" height="${bh}" `
        + `style="max-width:100%;border:1px dashed #b0b0b0;border-radius:6px;vertical-align:middle" />`;
}

// Alias historiques : clés supplémentaires produites par le moteur pour que les
// anciens modèles continuent de fonctionner (non affichées dans la palette).
const ALIAS_KEYS = [
    'Niveau suggérer', 'Offre', 'Today', 'TmpTotSem',
    'Semaine de la formation', 'Nom de l’entreprise', 'Responsable entreprise',
];

/** Liste plate de toutes les clés « catalogue » (hors alias). */
function catalogKeys() {
    return TOKEN_CATALOG.flatMap((g) => g.tokens.map((t) => t.key));
}

// Libellé lisible (+ groupe) de chaque jeton, pour les messages d'erreur.
const TOKEN_LABELS = {};
for (const g of TOKEN_CATALOG) for (const t of g.tokens) TOKEN_LABELS[t.key] = { label: t.label, group: g.group };

// Jetons dont la valeur vide est NORMALE (renseignés plus tard, ou facultatifs) :
// on ne les compte pas comme « information manquante » à la génération.
const OPTIONAL_TOKENS = new Set([
    'Signature stagiaire', 'Signature organisme', 'Nom signataire', 'Date signature',
    'Today', 'Date', 'Stagiaires',
    'Nom financeur', 'SIRET financeur', 'Adresse financeur', 'Email financeur', 'Téléphone financeur',
]);

/** Extrait les clés de jetons utilisées dans un corps HTML (puces + {Clé}). */
function usedTokenKeys(html) {
    const s = String(html || '');
    const keys = new Set();
    // Puces de l'éditeur : <span … data-token="Clé" …>
    for (const m of s.matchAll(/\sdata-token="([^"]+)"/g)) {
        keys.add(m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    }
    // Jetons en texte brut {Clé}
    for (const m of s.matchAll(/\{([^{}]+)\}/g)) keys.add(m[1].trim());
    return keys;
}

/**
 * Recherche les informations manquantes pour générer un document : jetons présents
 * dans le modèle (corps + en-tête + pied) dont la valeur résolue est vide.
 * Renvoie [{ key, label, group }] (jetons facultatifs/signatures exclus).
 */
function findMissingTokens(htmlParts, ctx) {
    const parts = Array.isArray(htmlParts) ? htmlParts : [htmlParts];
    const used = new Set();
    // Les jetons DANS un bloc {#Stagiaires}… sont résolus par stagiaire → on les
    // retire de l'analyse « manquants » (sinon {Prénom} serait signalé vide).
    for (const p of parts) for (const k of usedTokenKeys(stripGroupBlocks(p))) used.add(k);
    const values = resolveTokens(ctx);
    const missing = [];
    for (const key of used) {
        if (OPTIONAL_TOKENS.has(key)) continue;
        if (!(key in values)) continue; // clé inconnue : ignorée (texte libre)
        const v = values[key];
        if (v == null || String(v).trim() === '') {
            const meta = TOKEN_LABELS[key] || { label: key, group: null };
            missing.push({ key, label: meta.label, group: meta.group });
        }
    }
    // Tri par groupe puis libellé pour un message lisible.
    missing.sort((a, b) => String(a.group).localeCompare(String(b.group)) || a.label.localeCompare(b.label));
    return missing;
}

/** Table { Jeton: valeur } à partir du contexte (org, learner, company, formations). */
function resolveTokens(ctx = {}) {
    const o = ctx.org || {};
    const l = ctx.learner || {};
    const c = ctx.company || {};
    const fin = ctx.financeur || {};
    const finAddress = [fin.address, [fin.zip_code, fin.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const f = (ctx.formations && ctx.formations[0]) || {};
    const forms = ctx.formations || [];

    const fullName = [l.civility, l.first_name, l.last_name].filter(Boolean).join(' ').trim();
    const address = [l.address, [l.zip_code, l.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const cAddress = [c.address, [c.zip_code, c.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const orgAddress = [o.address, [o.zip_code, o.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const totalPrice = forms.reduce((s, x) => s + Number(x.enroll_price || x.price || 0), 0) || Number(f.price || 0);
    const totalAcompte = forms.reduce((s, x) => s + Number(x.acompte || 0), 0);
    // TVA : le prix stocké est le montant HT (base). Taux depuis l'organisme (0 = exonérée).
    const vatRate = Math.max(0, Number(o.vat_rate) || 0);
    const priceHT = totalPrice;
    const vatAmount = priceHT * vatRate / 100;
    const priceTTC = priceHT + vatAmount;

    // Agrégations multi-formations (un document peut couvrir plusieurs formations).
    const multi = forms.length > 1;
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const joinTitles = uniq(forms.map((x) => x.title)).join(', ') || (f.title || '');
    const sumHours = forms.reduce((s, x) => s + (Number(x.hours) || 0), 0);
    const sumDays = forms.reduce((s, x) => s + (Number(x.days) || 0), 0);
    const block = (field) => (!multi
        ? (f[field] || '')
        : forms.map((x) => (x[field] ? (x.title ? `${x.title} :\n${x[field]}` : x[field]) : '')).filter(Boolean).join('\n\n'));
    const durationDetail = multi
        ? forms.map((x) => [x.title, x.duration_detail].filter(Boolean).join(' : ')).filter(Boolean).join('\n')
        : (f.duration_detail || '');
    const starts = uniq(forms.map((x) => x.start_date)).sort();
    const ends = uniq(forms.map((x) => x.end_date)).sort();
    const start = starts[0] || f.start_date || '';
    const end = ends[ends.length - 1] || f.end_date || '';
    const today = frDate(new Date());
    const semaine = f.week ? `Semaine ${f.week} — ${f.year || ''}`.trim() : frDate(start);
    const sig = ctx.signature || {};

    return {
        // Stagiaire
        Personne: fullName, 'Civilité': l.civility || '', Nom: l.last_name || '', 'Prénom': l.first_name || '',
        Adresse: address, CP: l.zip_code || '', Ville: l.town || '',
        Email: l.email || '', 'Téléphone': l.phone || '',
        D_Naissance: frDate(l.birthday), 'Lieu naissance': l.birth_place || '', Statut: l.professional_status || '',
        'France Travail': l.france_travail_id || '',
        // Formation (agrégées si plusieurs)
        Formation: joinTitles, 'Niveau suggérer': joinTitles,
        Code: uniq(forms.map((x) => x.code || x.rs_code)).join(', ') || (f.code || f.rs_code || ''),
        Public: multi ? uniq(forms.map((x) => x.audience)).join(', ') : (f.audience || ''),
        Objectifs: block('objectives'),
        ObjectifG: multi ? uniq(forms.map((x) => x.objective_general)).join('\n') : (f.objective_general || ''),
        'DuréeDétail': durationDetail, 'Déroulé': block('program_detail'),
        Heures: sumHours ? String(sumHours) : (f.hours != null ? String(f.hours) : ''),
        Jours: sumDays ? String(sumDays) : (f.days != null ? String(f.days) : ''),
        TmpTotSem: sumHours ? String(sumHours) : (f.hours != null ? String(f.hours) : ''),
        PrixFormation: euro(totalPrice),
        // Session
        Jour1: frDate(start), endDate: frDate(end), Semaine: semaine,
        'Semaine de la formation': semaine, Formateur: f.trainer || '',
        Lundi: businessDay(start, 0), Mardi: businessDay(start, 1), Mercredi: businessDay(start, 2),
        Jeudi: businessDay(start, 3), Vendredi: businessDay(start, 4),
        // Dossier
        Financement: f.financing || '', Prix: euro(totalPrice), Offre: euro(totalPrice), Acompte: euro(totalAcompte),
        'Reste à payer': euro(totalPrice - totalAcompte),
        'Prix HT': euro(priceHT), TVA: euro(vatAmount),
        'Taux TVA': vatRate > 0 ? `${vatRate} %` : 'Exonérée', 'Prix TTC': euro(priceTTC),
        // Entreprise
        'Nom entreprise': c.name || '', 'Nom de l’entreprise': c.name || '',
        Siret: c.siret || '', OPCO: c.opco || l.opco || '', // repli sur l'OPCO du stagiaire (particulier financé)
        'Civ représentant': c.representative_civ || '', 'Nom représentant': c.representative_name || '',
        'Responsable entreprise': c.representative_name || '', 'Fonction représentant': c.representative_role || '',
        'Adresse entreprise': cAddress,
        'Email entreprise': c.email || '', 'Téléphone entreprise': c.phone || '',
        'NAF entreprise': c.naf_ape || '', 'Forme juridique': c.legal_status || '',
        // Financeur (OPCO)
        'Nom financeur': fin.name || c.opco || l.opco || '',
        'SIRET financeur': fin.siret || '', 'Adresse financeur': finAddress,
        'Email financeur': fin.email || '', 'Téléphone financeur': fin.phone || '',
        // Groupe (document entreprise) : tableau HTML de tous les stagiaires du groupe.
        Stagiaires: stagiairesTable(ctx.groupStagiaires),
        // Organisme
        Organisme: o.legal_name || '', 'Organisme court': o.short_name || '', Responsable: o.manager || '',
        'Siret organisme': o.siret || '', 'TVA organisme': o.vat_number || '', NDA: o.nda || '',
        'Adresse organisme': orgAddress, 'Ville organisme': o.town || '',
        'Téléphone organisme': o.phone || '', 'Email organisme': o.email || '',
        IBAN: o.iban || '', BIC: o.bic || '', Banque: o.bank_name || '',
        // Dates
        Date: today, Today: today,
        // Signature (valeurs HTML : cf. RAW_TOKENS)
        'Signature stagiaire': signatureBox(sig.data, 'Signature du stagiaire'),
        'Signature organisme': signatureBox(o.signature_image, "Signature de l'organisme"),
        'Nom signataire': sig.name || '',
        'Date signature': sig.date ? frDate(sig.date) : '',
        // Boucle docxtemplater : {#formations}{Titre} — {PrixLigne}{/formations}
        formations: forms.map((x) => ({
            Titre: x.title || '', Code: x.code || '', Heures: x.hours != null ? String(x.hours) : '',
            Jours: x.days != null ? String(x.days) : '', PrixLigne: euro(x.enroll_price || x.price || 0),
            Objectifs: x.objectives || '', 'Déroulé': x.program_detail || '', 'DuréeDétail': x.duration_detail || '',
            Debut: frDate(x.start_date), Fin: frDate(x.end_date),
        })),
    };
}

module.exports = { TOKEN_CATALOG, ALIAS_KEYS, RAW_TOKENS, TOKEN_LABELS, OPTIONAL_TOKENS, SIG_W, SIG_H, catalogKeys, resolveTokens, findMissingTokens, usedTokenKeys, signatureBox, expandGroupBlocks, stagiaireRowTokens, frDate, euro, businessDay };
