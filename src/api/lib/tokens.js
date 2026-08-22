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
            { key: 'Organisme court', label: 'Nom court', sample: 'Impastio' },
            { key: 'Responsable', label: 'Responsable', sample: 'Jean-Jacques Despaux' },
            { key: 'Siret organisme', label: 'SIRET', sample: '987 654 321 00019' },
            { key: 'TVA organisme', label: 'N° TVA', sample: 'FR76987654321' },
            { key: 'NDA', label: 'N° déclaration d’activité', sample: '75330000000' },
            { key: 'Adresse organisme', label: 'Adresse', sample: '1 rue du Four, 33000 Bordeaux' },
            { key: 'Ville organisme', label: 'Ville', sample: 'Bordeaux' },
            { key: 'Code postal organisme', label: 'Code postal', sample: '33000' },
            { key: 'Forme juridique organisme', label: 'Forme juridique', sample: 'S.A.S.' },
            { key: 'Capital organisme', label: 'Capital social', sample: '2000 euros' },
            { key: 'RCS organisme', label: 'RCS + ville', sample: 'RCS Tarbes 879 955 136' },
            { key: 'NAF organisme', label: 'Code NAF/APE', sample: '8559A' },
            { key: 'Téléphone organisme', label: 'Téléphone', sample: '05 56 00 00 00' },
            { key: 'Email organisme', label: 'E-mail', sample: 'contact@ecole-pizza.fr' },
            { key: 'IBAN', label: 'IBAN (RIB)', sample: 'FR76 3000 4000 0100 0001 2345 678' },
            { key: 'BIC', label: 'BIC / SWIFT', sample: 'AGRIFRPP' },
            { key: 'Banque', label: 'Domiciliation bancaire', sample: 'Crédit Agricole' },
        ],
    },
    {
        group: 'Facture',
        tokens: [
            { key: 'Numéro facture', label: 'Numéro', sample: 'F-2026-0012' },
            { key: 'Type facture', label: 'Type de pièce', sample: 'Facture' },
            { key: 'Date facture', label: 'Date d’émission', sample: '21/07/2026' },
            { key: 'Échéance facture', label: 'Date d’échéance', sample: '20/08/2026' },
            // Échantillon neutre : il est REMPLACÉ par l'identité fictive tirée à l'aperçu
            // (cf. lib/echantillons.js). Il portait le nom réel de l'utilisateur, ce qui rendait
            // l'aperçu indiscernable d'une vraie facture.
            { key: 'Acheteur', label: 'Nom de l’acheteur', sample: 'Camille BERGER' },
            { key: 'Adresse acheteur', label: 'Adresse de l’acheteur', sample: '12 rue des Fours, 33000 Bordeaux' },
            { key: 'Siret acheteur', label: 'SIRET de l’acheteur', sample: '123 456 789 00012' },
            { key: 'Total HT', label: 'Total hors taxes', sample: '17,82 €' },
            { key: 'Total TVA', label: 'Total TVA', sample: '3,56 €' },
            { key: 'Total TTC', label: 'Total toutes taxes comprises', sample: '21,38 €' },
            { key: 'Total remise', label: 'Total des remises', sample: '4,20 €',
              desc: 'Somme des remises accordées sur la facture, en euros. Affiche « 0,00 € » '
                  + 'quand il n’y a aucune remise. Vaut 0 sur les factures émises avant que la '
                  + 'remise ne soit enregistrée (migration 122).' },
            { key: 'Détail TVA', label: 'Détail de la TVA par taux', sample: '20,00 % sur 17,82 € : 3,56 €' },
            { key: 'Règlement', label: 'Moyen(s) de paiement', sample: 'Espèces + CB' },
            { key: 'Détail règlement', label: 'Moyens et montants réglés', sample: 'Espèces : 300,00 € · CB : 700,00 €' },
            { key: 'Règlements', label: 'Tableau des règlements', sample: '(tableau moyen / montant)' },
            { key: 'Articles', label: 'Tableau des articles', sample: '(tableau désignation / qté / prix / total)' },
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
    // Examen de certification — alimente le PROCÈS-VERBAL DE SESSION.
    //
    // Ces jetons sont la réponse directe au motif de refus du dossier RNCP n° 21983 :
    // « on n'arrive pas à savoir quelle est la certification qui a été visée ». Un PV
    // rédigé avec ce groupe ne peut pas être ambigu — il porte la certification, le
    // numéro RNCP, la voie d'accès, le centre, le lieu et le jury nommément.
    {
        group: 'Examen',
        tokens: [
            { key: 'Certification', label: 'Certification visée', sample: 'Artisan pizzaïolo' },
            { key: 'Code RNCP', label: 'Numéro RNCP', sample: 'RNCP41234' },
            { key: 'PV', label: 'Numéro de procès-verbal', sample: 'EPJJD-EX-2026-014' },
            { key: 'Date examen', label: "Date de la session d'examen", sample: '12/11/2026' },
            { key: 'Lieu examen', label: "Lieu de la session (adresse)", sample: '101 rue Alsace-Lorraine, 65300 Lannemezan' },
            { key: 'Centre examen', label: 'Centre habilité', sample: 'École Pizzaïolo Jean-Jacques Despaux' },
            { key: "Voie d'accès", label: "Voie d'accès du candidat", sample: 'Formation continue' },
            // Le jury, membre par membre. Sa composition est une condition de validité :
            // majorité extérieure à l'organisme, et aucun membre n'ayant formé le candidat.
            { key: 'Jury président', label: 'Président du jury', sample: 'M. Paul Rossi — pizzaïolo, La Napoli' },
            { key: 'Jury professionnel', label: 'Membre professionnel', sample: 'Mme Léa Fabre — pizzaïola, Le Four' },
            // Nom fictif comme ses deux voisins : celui-ci portait le nom réel de l'utilisateur.
            { key: 'Jury formateur', label: 'Membre formateur', sample: 'M. Marc Vidal — formateur' },
            { key: 'Jury mention', label: 'Attestation de composition du jury', sample: 'Deux membres sur trois extérieurs à l\'organisme. Aucun membre n\'a formé les candidats évalués.' },
            // Résultats. {Résultats} est un TABLEAU HTML (bloc par bloc) : cf. RAW_TOKENS.
            { key: 'Blocs présentés', label: 'Blocs présentés', sample: 'BC01, BC02' },
            { key: 'Blocs acquis', label: 'Blocs acquis', sample: 'BC01' },
            { key: 'Résultats', label: 'Tableau des résultats par bloc', sample: '(tableau bloc / points / seuil / verdict)' },
            { key: 'Décision', label: 'Décision du jury', sample: 'BLOCS ACQUIS' },
            { key: 'Observations', label: 'Observations du jury', sample: 'C1.7 non acquise : cause du défaut non identifiée.' },
        ],
    },
];

// Jetons dont la valeur est du HTML (image de signature, tableau) : insérés SANS échappement.
const RAW_TOKENS = new Set(['Signature stagiaire', 'Signature organisme', 'Stagiaires', 'Résultats', 'Articles', 'Règlements']);

// Échappement minimal pour insérer du texte dans une cellule HTML (jeton {Stagiaires}).
const escCell = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Tableau des articles d'une facture, un article par ligne. RAW : injecté tel quel.
 *
 * MÊME PRINCIPE QUE {Résultats} — un seul jeton qui produit un tableau complet. C'est la
 * réponse à un défaut d'ergonomie réel : la première version demandait d'insérer un bloc
 * {#Articles}…{/Articles} sous forme de TEXTE BRUT dans le document. On voyait alors des
 * accolades et des marqueurs au milieu d'un modèle où tout le reste est une puce propre —
 * fragile à l'édition (un retour à la ligne mal placé cassait le bloc) et illisible.
 *
 * Une puce, un tableau. Le bloc reste disponible pour qui veut choisir ses colonnes, mais il
 * n'est plus le chemin normal.
 *
 * Les colonnes suivent l'ordre d'une facture : ce qu'on a acheté, combien, à quel prix, ce que
 * ça fait. La colonne TVA n'apparaît QUE si les articles ont des taux différents — sur une
 * facture à taux unique, elle répète la même valeur à chaque ligne pour rien, et le taux est
 * déjà donné par {Détail TVA}.
 */
function articlesTable(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return '';
    const taux = new Set(rows.map((l) => Number(l.taxRate ?? 20)));
    const mixte = taux.size > 1;
    // Colonne Remise : même règle que la colonne TVA — elle n'apparaît QUE si elle a quelque
    // chose à dire. Sur une facture sans aucune remise, une colonne de tirets vole de la largeur
    // à la désignation, seul champ de longueur variable.
    const remise = rows.some((l) => Number(l && l.discount_pct) > 0);
    const head = '<tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th>'
        + (remise ? '<th>Remise</th>' : '') + '<th>Montant HT</th>'
        + (mixte ? '<th>TVA</th>' : '') + '<th>Total TTC</th></tr>';

    // LARGEURS DE COLONNES EXPLICITES. Sans elles, LibreOffice répartit à parts égales : la
    // désignation d'un article se retrouvait sur deux lignes pendant que « Qté » — trois
    // caractères — occupait autant de place, au point de se couper en « Q / té ». La
    // désignation est le seul champ de longueur variable ; elle prend ce que les autres, de
    // largeur connue, n'utilisent pas.
    // Chaque combinaison somme à 100 : la désignation absorbe ce que les colonnes de largeur
    // connue laissent. Les quatre cas sont écrits en clair plutôt que calculés — on les lit.
    const cols = mixte
        ? (remise ? [40, 7, 12, 9, 12, 8, 12] : [46, 7, 13, 13, 8, 13])
        : (remise ? [44, 8, 13, 9, 13, 13] : [50, 8, 14, 14, 14]);
    const colgroup = `<colgroup>${cols.map((w) => `<col width="${w}%">`).join('')}</colgroup>`;
    const cellules = rows.map((l, i) => articleRowTokens(l, i));
    const body = cellules.map((c) => (
        `<tr><td>${escCell(c['Désignation'])}</td><td>${escCell(c['Quantité'])}</td>`
        + `<td>${escCell(c['Prix unitaire HT'])}</td>`
        + (remise ? `<td>${escCell(c['Remise'])}</td>` : '')
        + `<td>${escCell(c['Montant HT'])}</td>`
        + (mixte ? `<td>${escCell(c['Taux TVA'])}</td>` : '')
        + `<td>${escCell(c['Montant TTC'])}</td></tr>`
    )).join('');

    // `width="100%"` : LibreOffice ignore la largeur CSS sur un tableau (cf. largeurTables).
    return `<table width="100%">${colgroup}<tbody>${head}${body}${totalRow(cellules, mixte, remise)}</tbody></table>`;
}

/**
 * Ligne de totaux, en bas du tableau des articles.
 *
 * ON ADDITIONNE CE QUI EST IMPRIMÉ, pas les valeurs d'origine. C'est le point délicat : les
 * montants de ligne sont arrondis au centime pour l'affichage, et additionner les valeurs
 * brutes donnerait un total qui ne correspond PAS à la colonne au-dessus. Un client qui
 * vérifie sa facture à la calculette trouverait un centime d'écart et aurait raison de le
 * signaler — sur une pièce comptable, un total qui ne tombe pas juste met en doute le reste.
 *
 * On relit donc les chaînes de la colonne. Ça paraît détourné, mais c'est exactement la
 * garantie qu'on veut : le total est, par construction, la somme de ce que le lecteur voit.
 *
 * LA COLONNE TVA RESTE VIDE quand les taux diffèrent : additionner 5,5 % et 20 % ne veut rien
 * dire, et y écrire un taux moyen serait une information fausse. La ventilation par taux est
 * donnée ailleurs, par {Détail TVA}.
 *
 * LA QUANTITÉ N'EST TOTALISÉE QUE SI ELLE EXISTE. Une facture de formation n'a pas de
 * quantités ; un « 0 » y ressemblerait à une donnée alors que c'est une absence.
 */
function totalRow(cellules, mixte, remise) {
    const nombre = (s) => Number(String(s || '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const eur = (n) => `${n.toFixed(2)} €`;

    const qtes = cellules.map((c) => c['Quantité']).filter((q) => q !== '');
    const totalQte = qtes.length ? String(qtes.reduce((s, q) => s + nombre(q), 0)) : '';
    const totalHt = cellules.reduce((s, c) => s + nombre(c['Montant HT']), 0);
    const totalTtc = cellules.reduce((s, c) => s + nombre(c['Montant TTC']), 0);

    const g = (v) => `<td><strong>${escCell(v)}</strong></td>`;
    // La colonne Remise reste VIDE au total, pour la même raison que la colonne TVA : additionner
    // des pourcentages ne veut rien dire. Le montant cumulé des remises a son jeton, {Total remise}.
    return `<tr><td><strong>Total</strong></td>${g(totalQte)}<td></td>`
        + (remise ? '<td></td>' : '') + `${g(eur(totalHt))}`
        + (mixte ? '<td></td>' : '') + `${g(eur(totalTtc))}</tr>`;
}

// Tableau des résultats d'examen, un bloc par ligne. RAW : injecté tel quel dans le PV.
// Le verdict n'est pas recalculé ici — il est lu depuis `verdicts`, figé à la clôture de la
// session. Un candidat garde le résultat obtenu sous le barème en vigueur ce jour-là, même
// si le barème évolue ensuite.
function resultatsTable(verdicts) {
    const rows = Object.entries(verdicts || {});
    if (!rows.length) return '';
    const head = '<tr><th>Bloc</th><th>Points</th><th>Seuil</th><th>Résultat</th></tr>';
    const body = rows.map(([code, v]) => {
        const acquis = v && v.acquis ? 'ACQUIS' : 'NON ACQUIS';
        // Le motif : un bloc peut tomber au-dessus du seuil, par compétence non compensable
        // ou par critère éliminatoire. Une décision défavorable se motive, sinon elle n'est
        // pas opposable au recours.
        const motif = v && !v.acquis
            ? (v.elimManques && v.elimManques.length ? ' — critère éliminatoire non satisfait'
                : (v.insuffisantes && v.insuffisantes.length ? ` — ${v.insuffisantes.join(', ')} sous 50 %` : ''))
            : '';
        return `<tr><td>${escCell(code)}</td><td>${escCell(v && v.total)}</td>`
             + `<td>${escCell(v && v.seuil)}</td><td>${escCell(acquis + motif)}</td></tr>`;
    }).join('');
    return `<table><tbody>${head}${body}</tbody></table>`;
}

// « M. Paul Rossi — pizzaïolo, La Napoli ». Le rôle vient de la position dans le jury.
const juryMembre = (m) => {
    if (!m) return '';
    return [m.nom, [m.qualite, m.employeur].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
};

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

/**
 * Jetons disponibles À L'INTÉRIEUR d'un bloc {#Articles}…{/Articles}.
 *
 * Même principe que `stagiaireRowTokens` : le bloc est répété une fois par ligne de facture,
 * et ces jetons-là sont recalculés à chaque tour. Les jetons globaux (Organisme, Total TTC…)
 * restent accessibles dans le bloc — c'est `expandBlocks` qui ne remplace que les jetons de
 * ligne, laissant les autres au remplacement normal.
 */
/** Tiret cadratin : ce que porte une case « sans remise ». Une case VIDE se lit comme une
 *  colonne oubliée ; le tiret dit « on a regardé, il n'y en a pas ». */
const SANS_REMISE = '—';

/**
 * Taux de remise d'une ligne, prêt à afficher : « 10 % », ou « — ».
 *
 * `null` (facture émise avant la migration 122, remise jamais enregistrée) et `0` (vendu sans
 * remise) donnent le même affichage — dans les deux cas il n'y a rien à annoncer au client.
 * Ils diffèrent en revanche pour le TOTAL en euros, qui ne doit sommer que du connu.
 */
function remiseTaux(l) {
    const p = l && l.discount_pct;
    if (p == null || !(Number(p) > 0)) return SANS_REMISE;
    // 10 et non 10,00 : un taux entier s'écrit sans décimales sur une facture.
    const n = Number(p);
    return `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} %`;
}

/**
 * Remise d'une ligne EN EUROS : (brut − net) × quantité.
 *
 * Deux montants déjà arrondis au centime, soustraits puis multipliés — le résultat tombe juste
 * et se raccroche au total facture. Repasser par le taux (net ÷ (1 − taux)) rendrait une
 * troisième décimale et ferait diverger le total des remises de la somme des lignes, exactement
 * la dérive que sale.controller.js documente avoir déjà payée.
 *
 * 0 si l'information manque : une facture d'avant la 122 ne doit pas inventer de remise.
 */
function remiseEuros(l) {
    if (!l) return 0;
    const brut = Number(l.unit_price_gross_ht);
    const net = Number(l.unit_price_ht);
    if (!Number.isFinite(brut) || !Number.isFinite(net) || brut <= net) return 0;
    const qte = Number(l.qty || 0) || 0;
    return Number(((brut - net) * qte).toFixed(2));
}

/** Somme des remises d'une facture, en euros. */
function remiseTotale(list) {
    const rows = Array.isArray(list) ? list : [];
    return Number(rows.reduce((s, l) => s + remiseEuros(l), 0).toFixed(2));
}

function articleRowTokens(l, i) {
    const eur = (n) => (n == null || n === '' ? '' : `${Number(n).toFixed(2)} €`);
    const qte = Number(l.qty || 0) || null;
    const pu = l.unit_price_ht != null ? Number(l.unit_price_ht) : (qte ? Number(l.amount) / qte : null);
    const taux = Number(l.taxRate ?? 20);
    const ht = Number(l.amount || 0);
    return {
        'N°': String(i + 1),
        'Référence': l.reference || '',
        'Désignation': l.name || '',
        'Quantité': qte != null ? String(qte) : '',
        'Prix unitaire HT': eur(pu),
        'Montant HT': eur(ht),
        'Remise': remiseTaux(l),
        'Taux TVA': `${taux.toFixed(2)} %`,
        'Montant TVA': eur(Math.round(ht * taux) / 100),
        'Montant TTC': eur(ht + Math.round(ht * taux) / 100),
    };
}

/**
 * Développe les blocs répétés d'une LISTE nommée : {#Articles}…{/Articles}.
 *
 * Généralise ce que `expandGroupBlocks` faisait pour les seuls stagiaires. Deux blocs, deux
 * listes, un seul mécanisme — plutôt qu'une seconde fonction qui ferait la même chose à un
 * nom près et divergerait à la première correction.
 */
function expandListBlocks(html, nom, rows, rowTokens, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    let out = String(html || '');
    const enLigne = !!opts.inline;
    // Nombre de lignes RÉSERVÉES (tableau à hauteur plancher). Les répétitions manquantes sont
    // comblées par des lignes vides, seul procédé que LibreOffice respecte (cf. `lignesVides`).
    const mini = Math.max(0, parseInt(opts.minLines, 10) || 0);
    const comble = (corps, n) => lignesVides(corps, mini - n);

    /* FORME TABLEAU, traitée en premier.
     *
     * L'éditeur de modèles est un ProseMirror : sa grammaire interdit du texte directement
     * dans un <tbody>. Un gabarit écrit « <tbody>{#Articles}<tr>… » voit donc ses marqueurs
     * REMONTÉS hors du tableau à l'insertion — ils atterrissent dans un paragraphe au-dessus,
     * et le bloc ne se répète jamais. Constaté dans l'éditeur réel.
     *
     * Les marqueurs vivent donc DANS des cellules, ce que la grammaire accepte, et c'est la
     * LIGNE qui les contient qu'on répète. `<tr>` complet à chaque article, marqueurs retirés.
     *
     * EN MODE « EN LIGNE » (tableau data-rows="inline"), c'est la même ligne qu'on repère, mais
     * on la garde UNIQUE et on empile dans chaque cellule — cf. `empilerDansLaLigne`.
     */
    const reLigne = new RegExp(
        `<tr\\b[^>]*>(?:(?!</tr>)[\\s\\S])*?\\{#\\s*${nom}\\s*\\}(?:(?!</tr>)[\\s\\S])*?\\{/\\s*${nom}\\s*\\}(?:(?!</tr>)[\\s\\S])*?</tr>`, 'g');
    out = out.replace(reLigne, (ligne) => {
        if (enLigne) return empilerDansLaLigne(ligne, nom, list, rowTokens, mini);
        if (!list.length) return '';
        const gabarit = ligne
            .replace(new RegExp(`\\{#\\s*${nom}\\s*\\}`, 'g'), '')
            .replace(new RegExp(`\\{/\\s*${nom}\\s*\\}`, 'g'), '');
        return list.map((r, i) => remplirLigne(gabarit, rowTokens(r, i))).join('');
    });

    const re = new RegExp(`\\{#\\s*${nom}\\s*\\}([\\s\\S]*?)\\{/\\s*${nom}\\s*\\}`, 'g');
    return out.replace(re, (m, tpl) => {
        // Liste vide : le bloc disparaît — mais un tableau à hauteur réservée garde ses lignes,
        // sinon une facture sans article ferait remonter les totaux.
        if (!list.length) return comble('', 0);
        const corps = list.map((r, i) => remplirLigne(tpl, rowTokens(r, i))).join('');
        return corps + comble(corps, list.length);
    });
}

/**
 * Complète `corps` par `n` lignes vides, pour un tableau à hauteur réservée.
 *
 * POURQUOI DU CONTENU ET PAS UNE HAUTEUR CSS. LibreOffice ignore la hauteur d'un tableau sous
 * TOUTES ses formes — attribut `height` sur <table> comme sur <tr>, `height` CSS sur la table
 * ou sur la cellule, et même un `padding-bottom` en millimètres. Vérifié en rendant les six
 * variantes côte à côte : toutes sortaient à la hauteur du seul contenu. Le seul levier que le
 * moteur respecte, c'est le contenu lui-même — d'où ces lignes vides.
 *
 * `&nbsp;` et non une ligne nue : un blanc « vrai » se fait supprimer au même titre qu'un <p>
 * vide (cf. htmlfill.js), et la ligne réservée s'évaporerait.
 *
 * Le saut d'amorce n'est ajouté QUE si le gabarit n'en finit pas déjà un. Un bloc écrit
 * « …{Montant TTC}<br> » nous laisse en début de ligne neuve : en remettre un décalerait tout
 * d'une ligne et le tableau dépasserait la hauteur demandée d'un cran.
 */
function lignesVides(corps, n) {
    if (n <= 0) return '';
    const amorce = corps && !/<br\s*\/?>\s*$/i.test(corps) ? '<br>' : '';
    return amorce + '&nbsp;<br>'.repeat(n - 1) + '&nbsp;';
}

/**
 * Mode « en ligne » : une SEULE ligne de tableau, les articles empilés DANS CHAQUE CELLULE.
 *
 * LE PIÈGE QUE ÇA CORRIGE. Dans les vrais modèles, le bloc ENJAMBE la ligne : `{#Articles}`
 * ouvre dans la première cellule et `{/Articles}` ferme dans la dernière (constaté sur
 * `facture-stagiaire` : sept cellules, marqueurs en 0 et en 6). Répéter tel quel le contenu
 * situé entre les marqueurs recopie donc aussi les `</td><td>` intermédiaires : la ligne gagnait
 * des COLONNES au lieu de gagner des lignes, et la facture sortait avec le deuxième article
 * étalé à droite du premier. Vu à l'aperçu PDF, pas au test — le test d'origine posait les deux
 * marqueurs dans UNE cellule, une forme inventée, pas celle des modèles réels.
 *
 * On répète donc chaque cellule SUR PLACE, séparateur `<br>`, et on comble chaque cellule
 * jusqu'à la hauteur réservée. Le `<p>` que ProseMirror pose dans chaque cellule est conservé
 * UNIQUE et c'est son contenu qu'on répète : sinon un `<p>` par article rouvrirait les marges
 * de paragraphe et l'empilement respirerait deux fois trop.
 */
function empilerDansLaLigne(ligne, nom, list, rowTokens, mini) {
    const reOuvre = new RegExp(`\\{#\\s*${nom}\\s*\\}`);
    const reFerme = new RegExp(`\\{/\\s*${nom}\\s*\\}`);

    // Découpe en cellules, en conservant ce qui les sépare (<tr>, blancs, </tr>).
    const cellules = [];
    const reCell = /(<(td|th)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;
    let fin = 0, m;
    while ((m = reCell.exec(ligne)) !== null) {
        cellules.push({ avant: ligne.slice(fin, m.index), ouvrant: m[1], contenu: m[3], fermant: m[4] });
        fin = m.index + m[0].length;
    }
    if (!cellules.length) return ligne;
    const queue = ligne.slice(fin);

    const iOuvre = cellules.findIndex((c) => reOuvre.test(c.contenu));
    const iFerme = cellules.findIndex((c) => reFerme.test(c.contenu));
    if (iOuvre === -1 || iFerme === -1 || iFerme < iOuvre) return ligne; // forme inattendue : intacte

    return cellules.map((c, i) => {
        // HORS de la portée des marqueurs : cellule laissée telle quelle. C'est ce qui distingue
        // un bloc qui ENJAMBE la ligne (toutes les cellules se remplissent) d'un bloc tenant dans
        // UNE cellule (les voisines ne doivent surtout pas être recopiées par article).
        if (i < iOuvre || i > iFerme) return c.avant + c.ouvrant + c.contenu + c.fermant;

        /* APLATISSEMENT DES PARAGRAPHES. Une cellule peut en contenir PLUSIEURS — dans
         * `facture-stagiaire`, les colonnes « Taux TVA » et « Taux TTC » en ont deux, dont un
         * vide resté là du temps où la ligne se répétait (sans conséquence alors). Répéter tel
         * quel un bloc multi-paragraphes rouvre les marges à chaque article ; et une extraction
         * naïve du `<p>` capture `A</p><p>B` comme intérieur, produisant une imbrication invalide
         * que le moteur normalise en saut de ligne PARASITE. Sur l'aperçu, les deux dernières
         * colonnes flottaient une ligne plus bas que les cinq autres.
         *
         * On aplatit donc : frontière de paragraphe → `<br>`, et une seule enveloppe `<p>` en
         * sortie (ses attributs — un alignement, typiquement — sont repris du premier). */
        const attrsP = (/<p\b([^>]*)>/i.exec(c.contenu) || ['', ''])[1];
        const avaitP = /<p\b/i.test(c.contenu);
        let gabarit = c.contenu
            .replace(/<\/p>\s*<p\b[^>]*>/gi, '<br>')
            .replace(/^\s*<p\b[^>]*>/i, '')
            .replace(/<\/p>\s*$/i, '');

        // Ce qui précède l'ouvrant / suit le fermant est du texte FIXE de la cellule : écrit une
        // fois, jamais répété.
        let texteAvant = '', texteApres = '';
        if (i === iOuvre) { const p = gabarit.split(reOuvre); texteAvant = p[0]; gabarit = p.slice(1).join(''); }
        if (i === iFerme) { const p = gabarit.split(reFerme); gabarit = p[0]; texteApres = p.slice(1).join(''); }

        // Sauts en tête et en queue du motif : ils se multiplieraient par le nombre d'articles.
        // C'est exactement le paragraphe vide ci-dessus — anodin en répétition de lignes, il
        // ajoutait ici une ligne blanche PAR article.
        gabarit = gabarit.replace(/^(?:\s|<br\s*\/?>)+/i, '').replace(/(?:\s|<br\s*\/?>)+$/i, '');

        const corps = list.map((r, k) => remplirLigne(gabarit, rowTokens(r, k))).join('<br>');
        const rempli = texteAvant + corps + lignesVides(corps, mini - list.length) + texteApres;
        return c.avant + c.ouvrant + (avaitP ? `<p${attrsP}>${rempli}</p>` : rempli) + c.fermant;
    }).join('') + queue;
}

/** Remplace, dans un gabarit, les jetons d'UNE ligne — puces de l'éditeur comme texte {Clé}. */
function remplirLigne(gabarit, vals) {
    let out = gabarit;
    for (const [k, v] of Object.entries(vals)) {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const val = String(v == null ? '' : v);
        out = out.replace(new RegExp(`<span[^>]*\\sdata-token="${esc}"[^>]*>[\\s\\S]*?<\\/span>`, 'g'), val);
        out = out.split(`{${k}}`).join(val);
    }
    return out;
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
            let out = String(tpl);
            // 1) Puces (jetons cliqués dans la palette) : <span data-token="Clé">…</span>.
            //    Les jetons par stagiaire s'insèrent désormais comme puces propres (et non plus
            //    en {Clé} brut) — il faut donc les remplir ICI, par stagiaire, sinon la puce
            //    « Prénom » retomberait sur le remplacement GLOBAL (le stagiaire du dossier).
            for (const [k, val] of Object.entries(repl)) {
                const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                out = out.replace(new RegExp(`<span[^>]*\\sdata-token="${esc}"[^>]*>[\\s\\S]*?<\\/span>`, 'g'),
                    escCell(val == null ? '' : String(val)));
            }
            // 2) Forme texte {Clé} (modèles hérités, décalage de date {Jour1|+2}).
            return out.replace(/\{\s*([^{}|]+?)\s*(?:\|\s*([+-]?\d+)\s*)?\}/g, (mm, ref, off) => {
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
    const bw = Number(w) || SIG_W, bh = Number(h) || SIG_H; // dimensions FORCÉES en nombre (jamais injectables)
    /* #2 XSS — ces jetons sont RAW (non échappés par htmlfill), et une « signature » est une donnée
       fournie par l'utilisateur. On échappe donc pour le CONTEXTE ATTRIBUT (dont `"`) : sinon un
       `data:image/png;base64,AA"><img src=x onerror=…>` fermerait la balise et s'exécuterait à
       l'aperçu du document — dans la session de l'admin qui l'ouvre. Défense au sink, en plus de la
       validation à l'écriture (signDocument / signRepDocument / setRepStamp / submitSign). */
    const a = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (dataUrl && /^data:image\//.test(dataUrl)) {
        return `<img src="${a(dataUrl)}" alt="${a(label)}" width="${bw}" height="${bh}" `
            + `style="max-width:100%;object-fit:contain;vertical-align:middle" />`;
    }
    return `<img src="${SPACER_GIF}" alt="${a(label)}" width="${bw}" height="${bh}" `
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
/**
 * Valeurs des jetons propres a une FACTURE.
 *
 * Separe de `resolveTokens` parce qu'ils ne viennent pas du meme endroit : une facture n'a pas
 * de dossier, pas de session, pas de formation. Elle a un acheteur — qui peut etre un stagiaire
 * OU une entreprise OU un nom libre saisi au comptoir — des lignes, et des totaux.
 *
 * Ils sont FUSIONNES aux jetons standard : un modele de facture peut donc utiliser
 * {Organisme}, {Adresse organisme} ou {Siret organisme} comme n'importe quel autre document.
 */
function invoiceTokens(inv = {}) {
    if (!inv || !inv.number) return {};
    const v = inv.tva || {};
    return {
        'Numéro facture': inv.number || '',
        'Type facture': inv.typeLabel || 'Facture',
        'Date facture': inv.dateFr || '',
        'Échéance facture': inv.dueFr || '',
        'Acheteur': inv.buyerName || '',
        'Adresse acheteur': inv.buyerAddress || '',
        'Siret acheteur': inv.buyerSiret || '',
        'Total HT': inv.totalHt || '',
        'Total TVA': inv.totalTva || '',
        'Total TTC': inv.totalTtc || '',
        // Remise consentie sur l'ensemble de la facture. Formaté comme les totaux voisins
        // (deux décimales, toujours) et NON avec euro(), qui rend une chaîne VIDE sur zéro et
        // laisse tomber les décimales d'un montant rond : un modèle qui réserve une ligne
        // « Remise » doit afficher « 0.00 € », pas un trou, et s'aligner sur Total HT / Total TTC.
        'Total remise': `${remiseTotale(inv.articles).toFixed(2)} €`,
        'Détail TVA': inv.detailTva || '',
        // Règlement : le moyen (résumé) et le détail moyen+montant. {Règlements} en fait un tableau.
        'Règlement': inv.reglement || '',
        'Détail règlement': inv.detailReglement || '',
        'Règlements': paiementsTable(inv.payments),
        // Tableau complet, comme {Résultats}. Le bloc {#Articles}…{/Articles} reste possible
        // pour qui veut choisir ses colonnes ; ce jeton-ci est le chemin normal.
        'Articles': articlesTable(inv.articles),
    };
}

/**
 * Jetons d'UNE ligne de règlement, dans un bloc {#Paiements}…{/Paiements}.
 * Le montant réglé par ce moyen, plus banque et numéro pour un chèque.
 */
function paiementRowTokens(p, i) {
    const eur = (n) => (n == null || n === '' ? '' : `${Number(n).toFixed(2)} €`);
    return {
        'N°': String(i + 1),
        'Moyen': p.method || '',
        'Montant réglé': eur(p.amount),
        'Banque': p.bank || '',
        'N° chèque': p.cheque_number || '',
    };
}

/** Petit tableau des règlements (moyen | montant), colonne chèque si un chèque est détaillé. */
function paiementsTable(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return '';
    const cheque = rows.some((p) => p.cheque_number || p.bank);
    const head = `<tr><th>Moyen</th>${cheque ? '<th>Banque / n° chèque</th>' : ''}<th>Montant</th></tr>`;
    const body = rows.map((p, i) => {
        const c = paiementRowTokens(p, i);
        const ref = [c['Banque'], c['N° chèque'] && `n° ${c['N° chèque']}`].filter(Boolean).join(' · ');
        return `<tr><td>${escCell(c['Moyen'])}</td>${cheque ? `<td>${escCell(ref)}</td>` : ''}<td style="text-align:right">${escCell(c['Montant réglé'])}</td></tr>`;
    }).join('');
    return `<table width="100%">${head}${body}</table>`;
}

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

    // Examen de certification. `ex` = la session, `res` = le résultat du candidat.
    const ex = ctx.exam || {};
    const res = ctx.examResult || {};
    const jury = Array.isArray(ex.jury) ? ex.jury : [];
    const VOIES = {
        FORMATION_CONTINUE: 'Formation continue',
        CANDIDATURE_INDIVIDUELLE: 'Candidature individuelle',
        VAE: 'Validation des acquis de l\'expérience',
    };
    const DECISIONS = {
        CERTIFIE: 'CERTIFICATION DÉLIVRÉE', BLOCS_ACQUIS: 'BLOCS ACQUIS',
        AJOURNE: 'AJOURNÉ', ABSENT: 'ABSENT', EXCLU: 'EXCLU', EN_COURS: '',
    };
    const verdicts = res.verdicts || {};
    const blocsAcquis = Object.entries(verdicts).filter(([, v]) => v && v.acquis).map(([c]) => c);
    // La mention n'est pas cosmétique : la majorité extérieure et l'absence de lien
    // formateur-candidat sont des conditions de validité de la session.
    const nbExternes = jury.filter((m) => m && m.externe).length;
    const juryMention = jury.length
        ? `${nbExternes} membre${nbExternes > 1 ? 's' : ''} sur ${jury.length} extérieur${nbExternes > 1 ? 's' : ''} à l'organisme. `
          + `Aucun membre n'a formé les candidats évalués.`
        : '';

    const factureVals = invoiceTokens(ctx.invoice);

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
        'Adresse organisme': orgAddress, 'Ville organisme': o.town || '', 'Code postal organisme': o.zip_code || '',
        'Téléphone organisme': o.phone || '', 'Email organisme': o.email || '',
        // Identité de société — portées par l'entité émettrice sur une facture (l'organisme
        // n'a pas ces colonnes ; elles restent vides hors facture).
        'Forme juridique organisme': o.legal_status || '', 'Capital organisme': o.capital || '',
        'RCS organisme': o.rcs || '', 'NAF organisme': o.naf_ape || '',
        IBAN: o.iban || '', BIC: o.bic || '', Banque: o.bank_name || '',
        // Examen de certification (procès-verbal de session)
        Certification: ex.certification || '', 'Code RNCP': ex.rncp_code || '',
        PV: ex.pv_ref || '', 'Date examen': frDate(ex.date_examen),
        'Lieu examen': ex.lieu || '', 'Centre examen': ex.centre || '',
        "Voie d'accès": VOIES[ex.voie_acces] || '',
        'Jury président': juryMembre(jury[0]), 'Jury professionnel': juryMembre(jury[1]),
        'Jury formateur': juryMembre(jury[2]), 'Jury mention': juryMention,
        'Blocs présentés': (res.blocs_presentes || []).join(', '),
        'Blocs acquis': blocsAcquis.join(', '),
        'Résultats': resultatsTable(verdicts),
        'Décision': DECISIONS[res.decision] || '', Observations: res.observations || '',
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
        // Jetons propres a une FACTURE. Fusionnes en dernier : ils ne remplacent rien, ils
        // s'ajoutent — un modele de facture garde acces a {Organisme}, {Adresse organisme}…
        ...factureVals,
    };
}

module.exports = { TOKEN_CATALOG, articlesTable, articleRowTokens, paiementRowTokens, paiementsTable, expandListBlocks, invoiceTokens, ALIAS_KEYS, RAW_TOKENS, TOKEN_LABELS, OPTIONAL_TOKENS, SIG_W, SIG_H, catalogKeys, resolveTokens, findMissingTokens, usedTokenKeys, signatureBox, expandGroupBlocks, stagiaireRowTokens, frDate, euro, businessDay };
