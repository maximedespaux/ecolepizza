import PageHead from "../components/PageHead.jsx";
import FieldSettingsPanel from "../components/FieldSettingsPanel.jsx";

// Réglage des champs du dossier utilisables comme conditions (Modeles → Conditions).
// Découverts automatiquement dans la base ; on choisit lesquels activer.
function ChampsDossier() {
  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Champs du dossier"
        lead="Choisissez les informations du dossier (stagiaire, formation, inscription…) utilisables comme conditions. Cochez un champ pour le rendre disponible dans Modèles de documents → Conditions. Vous pouvez renommer l'intitulé affiché."
      />
      <FieldSettingsPanel />
    </>
  );
}

export default ChampsDossier;
