import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Mercuriale from "../components/Mercuriale.jsx";
import { getMercuriale } from "../api/apiClient.js";

/**
 * Ma mercuriale — OUTIL À PART ENTIÈRE (sortie de « Mes garnitures » le 2026-09-29).
 * La liste de prix curée du compte : ses produits (Metro, frais, marché) avec prix, unité et
 * source. Les FICHES TECHNIQUES y puisent pour chiffrer leurs ingrédients. Le composant
 * `Mercuriale` gère les deux onglets (catalogue général / ma liste) ; on le charge et l'habille.
 * Sans `onBack`, il n'affiche pas le bouton « Accueil garnitures » : ici c'est une page de plein droit.
 */
export default function MercurialePage() {
  const [items, setItems] = useState([]);
  const reload = () => getMercuriale().then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);
  return (
    <>
      <PageHead icon="coins" eyebrow="Outils · ma mercuriale" title="Ma mercuriale"
        lead="Ta liste de prix : ajoute tes produits (Metro, frais et marché) avec leur prix et leur unité. Tes fiches techniques y puisent pour calculer les coûts." />
      <Mercuriale items={items} reload={reload} />
    </>
  );
}
