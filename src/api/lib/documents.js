// Règles de sélection documentaire (portées depuis ecolepizza src/lib/documents).
// Le jeu de documents d'un dossier dépend de : financement (particulier/pro),
// formation certifiante (RS7404), hygiène (NIV1H) et durée.

/**
 * @param {{ hygiene:boolean, rsCode?:string|null, jours:number, financing:'PARTICULIER'|'PROFESSIONNEL' }} o
 * @returns liste ordonnée de documents { num, type, label, signable, stagiaireSign }
 *   - signable       : le document nécessite une signature (organisme et/ou stagiaire)
 *   - stagiaireSign  : le stagiaire doit signer ce document depuis son espace
 */
function documentSetFor(o) {
    const financing = o.financing === 'PROFESSIONNEL' ? 'PROFESSIONNEL' : 'PARTICULIER';
    const isPart = financing === 'PARTICULIER';

    const devisLabel = o.rsCode ? 'Devis RS7404' : isPart ? 'Devis particulier' : 'Devis entreprise';
    const contratType = isPart ? 'CONTRAT' : 'CONVENTION';
    const contratLabel = isPart ? 'Contrat de formation' : 'Convention de formation';
    const emarg = o.hygiene ? "Feuille d'émargement 5J + hygiène" : `Feuille d'émargement ${o.jours}J`;

    const list = [
        { type: 'PROGRAMME', label: 'Programme de formation', signable: false, stagiaireSign: false },
        { type: 'FICHE_SEMAINE', label: "Fiche d'expression de besoin", signable: false, stagiaireSign: false },
        {
            type: 'TEST_POSITIONNEMENT',
            label: o.hygiene ? 'Test Hygiène' : 'Test de positionnement',
            signable: false, stagiaireSign: false,
        },
        { type: 'DEVIS', label: devisLabel, signable: true, stagiaireSign: true },
        { type: contratType, label: contratLabel, signable: true, stagiaireSign: true },
        o.rsCode
            ? { type: 'CONVOCATION', label: "Convocation à l'examen", signable: false, stagiaireSign: false }
            : { type: 'INVITATION', label: 'Invitation', signable: false, stagiaireSign: false },
        { type: 'DROIT_IMAGE', label: "Droit à l'image", signable: true, stagiaireSign: true },
        { type: 'EMARGEMENT', label: emarg, signable: false, stagiaireSign: false },
    ];
    if (o.hygiene) {
        list.push({ type: 'ATTESTATION_HYGIENE', label: 'Attestation Hygiène', signable: false, stagiaireSign: false });
    }
    list.push({ type: 'CERTIFICAT_REALISATION', label: 'Certificat de réalisation', signable: true, stagiaireSign: false });
    list.push({ type: 'EVALUATION_MANAGEUR', label: 'Évaluation Manageur', signable: false, stagiaireSign: false });
    list.push({ type: 'EVALUATION_FINANCEUR', label: 'Évaluation Financeur', signable: false, stagiaireSign: false });

    return list.map((d, i) => ({ num: i + 1, ...d }));
}

module.exports = { documentSetFor };
