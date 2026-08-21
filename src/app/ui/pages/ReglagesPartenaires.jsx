import PageHead from "../components/PageHead.jsx";
import ChampsPartenaires from "../components/ChampsPartenaires.jsx";

/**
 * RÉGLAGES → PARTENAIRES — ce que l'école communique, et à qui.
 *
 * POURQUOI UNE PAGE À PART plutôt qu'une section de la fiche « Organisme ». Ce réglage ne DÉCRIT
 * pas l'organisme comme le font sa raison sociale ou son SIRET : il décide de ce qui SORT de
 * l'école, information par information, et le texte que des dizaines de personnes liront et
 * accepteront en découle mot pour mot. Rangé sous « Organisme », il se serait lu comme un détail
 * administratif de plus, entre le code NAF et le RIB.
 *
 * Le sommaire des paramètres le fait donc apparaître pour ce qu'il est : une rubrique entière.
 */
function ReglagesPartenaires() {
  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Partenaires"
        lead="Ce que l'école communique aux partenaires sur les stagiaires qui l'ont accepté."
      />
      <ChampsPartenaires />
    </>
  );
}

export default ReglagesPartenaires;
