/**
 * Modèle de facture prêt à l'emploi — les mentions obligatoires, à leur place.
 *
 * POURQUOI UN PRÊT-À-L'EMPLOI. Une facture n'est pas une mise en page libre : le Code de
 * commerce (art. L441-9) et le CGI (art. 242 nonies A, ann. II) énumèrent ce qu'elle DOIT
 * porter. Partir d'une page blanche, c'est en oublier — et un oubli ne se voit qu'au contrôle,
 * ou quand un client refuse de payer une facture non conforme.
 *
 * CE MODÈLE N'ÉCRIT RIEN EN BASE. Il remplit l'éditeur ; c'est l'organisme qui relit et
 * enregistre. Une facture engage son émetteur : personne d'autre que lui ne doit décider de ce
 * qu'elle affirme.
 *
 * CE QU'IL COUVRE, article par article :
 *   · date d'émission et numéro unique ...................... {Date facture}, {Numéro facture}
 *   · identité du vendeur, adresse, SIRET, NAF .............. bloc en-tête
 *   · n° de TVA intracommunautaire .......................... obligatoire dès 150 € HT
 *   · n° de déclaration d'activité .......................... propre aux organismes de formation
 *   · identité et adresse de l'acheteur ..................... {Acheteur}, {Adresse acheteur}
 *   · désignation, quantité, prix unitaire HT ............... {Articles}
 *   · taux de TVA et ventilation par taux ................... {Détail TVA}
 *   · totaux HT, TVA, TTC ................................... {Total HT}, {Total TVA}, {Total TTC}
 *   · date d'échéance ....................................... {Échéance facture}
 *   · pénalités de retard et indemnité de 40 € .............. mentions légales, texte fixe
 *   · conditions d'escompte ................................. texte fixe
 *
 * CE QU'IL NE PEUT PAS COUVRIR, faute de champ dans la fiche organisme : la forme juridique,
 * le capital social et le n° RCS avec sa ville d'immatriculation. Ces trois mentions sont
 * obligatoires pour une société commerciale (elles ne s'appliquent pas à une entreprise
 * individuelle). Un encadré les rappelle dans le modèle, à compléter en clair ou à supprimer
 * selon la forme de l'organisme — mieux vaut une consigne visible qu'une omission silencieuse.
 *
 * Les jetons sont écrits sous la forme `<span data-token="…">`, celle que l'éditeur produit et
 * relit. Une accolade en texte brut fonctionnerait aussi, mais s'afficherait comme du code au
 * milieu d'un document où tout le reste est une puce.
 */

/**
 * Une puce de jeton, comme l'éditeur les produit.
 *
 * Le LIBELLÉ n'est pas décoratif : la puce affiche `data-label`, ou à défaut son texte. Sans
 * lui, l'éditeur montrait « field:organization.legal_name » au lieu de « Raison sociale » —
 * une clé technique en plein milieu du document, illisible pour qui relit son modèle.
 * Constaté en chargeant le modèle dans l'éditeur réel.
 */
const j = (cle, libelle) =>
  `<span data-token="${cle}" data-label="${libelle}">${libelle}</span>`;

export const MODELE_FACTURE = [
  // --- Émetteur ---------------------------------------------------------------------------
  '<p><strong>', j('field:organization.legal_name', "Raison sociale de l'organisme"), '</strong><br>',
  j('field:organization.address', 'Adresse'), ' — ', j('field:organization.zip_code', 'Code postal'), ' ', j('field:organization.town', 'Ville'), '<br>',
  'SIRET ', j('field:organization.siret', 'SIRET'), ' · NAF ', j('field:organization.naf_ape', 'Code NAF/APE'), '<br>',
  'N° TVA ', j('field:organization.vat_number', 'N° TVA'), '<br>',
  'Déclaration d’activité n° ', j('field:organization.nda', "N° de déclaration d'activité (NDA)"), '<br>',
  j('field:organization.phone', 'Téléphone'), ' · ', j('field:organization.email', 'E-mail'),
  '</p>',

  // Mentions que la fiche organisme ne porte pas encore. Laissées en clair, à compléter ou à
  // retirer : une société commerciale doit les faire figurer, une entreprise individuelle non.
  '<p><em>Forme juridique — Capital social — RCS et ville d’immatriculation</em> ',
  '<span style="color:#c0392b">(à compléter ou à supprimer selon la forme de votre organisme)</span></p>',

  '<hr>',

  // --- Titre et références ----------------------------------------------------------------
  '<h1>', j('Type facture', 'Type de pièce'), ' ', j('Numéro facture', 'Numéro'), '</h1>',
  '<p>Date d’émission : ', j('Date facture', "Date d'émission"), '<br>',
  'Échéance de règlement : ', j('Échéance facture', "Date d'échéance"), '</p>',

  // --- Acheteur ---------------------------------------------------------------------------
  '<p><strong>Facturé à</strong><br>',
  j('Acheteur', "Nom de l'acheteur"), '<br>',
  j('Adresse acheteur', "Adresse de l'acheteur"), '<br>',
  'SIRET ', j('Siret acheteur', "SIRET de l'acheteur"),
  '</p>',

  // --- Détail ------------------------------------------------------------------------------
  '<h2>Détail</h2>',
  '<p>', j('Articles', 'Tableau des articles'), '</p>',

  // --- Totaux ------------------------------------------------------------------------------
  '<p>Total HT : <strong>', j('Total HT', 'Total hors taxes'), '</strong><br>',
  'TVA : ', j('Total TVA', 'Total TVA'), ' — ', j('Détail TVA', 'Détail de la TVA par taux'), '<br>',
  'Total TTC : <strong>', j('Total TTC', 'Total toutes taxes comprises'), '</strong></p>',

  '<hr>',

  // --- Règlement ---------------------------------------------------------------------------
  '<h2>Règlement</h2>',
  '<p>Par virement : IBAN ', j('field:organization.iban', 'IBAN'), ' · BIC ', j('field:organization.bic', 'BIC / SWIFT'),
  ' — ', j('field:organization.bank_name', 'Banque'), '</p>',

  // Mentions légales entre professionnels. Le taux plancher est de trois fois l'intérêt légal ;
  // l'indemnité de 40 € est forfaitaire et due de plein droit (art. L441-10 C. com.).
  '<p style="font-size:9pt">',
  'En cas de retard de paiement, des pénalités seront appliquées au taux de trois fois le taux ',
  'de l’intérêt légal, ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement ',
  '(art. L441-10 du Code de commerce). Pas d’escompte pour paiement anticipé.',
  '</p>',

  // Exonération de TVA propre à la formation professionnelle. À supprimer sur une facture de
  // vente de matériel, qui n'entre pas dans le champ de cet article.
  '<p style="font-size:9pt"><em>Le cas échéant : TVA non applicable, article 261-4-4° du CGI ',
  '(formation professionnelle continue).</em></p>',
].join('');
