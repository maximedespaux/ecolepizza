import { useEffect, useState } from "react";
import Card from "./Card.jsx";
import { saveShopSettings, getTemplates } from "../api/apiClient.js";

/**
 * Réglages de facturation (préfixe, numérotation, moyens de paiement, TVA, modèle de facture).
 *
 * Déplacé depuis l'onglet « Réglages » de Ventes & Inventaire vers les Paramètres de l'organisme :
 * c'est un réglage d'organisme, pas une action de caisse. Le composant reste autonome — il charge
 * ses modèles et enregistre lui-même.
 */
export default function ShopSettings({ settings, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    invoice_prefix: settings?.invoice_prefix || "F",
    next_number: settings?.next_number || 1,
    payment_methods: settings?.payment_methods || "Espèces,CB,Virement,Chèque",
    tva_applies: settings ? !!settings.tva_applies : true,
    invoice_template_slug: settings?.invoice_template_slug || "",
  }));
  // SEULS les modèles de type FACTURE. Le serveur applique la même règle à l'enregistrement et
  // au moment de produire le PDF — un modèle peut changer de type après avoir été choisi.
  const [modeles, setModeles] = useState([]);
  useEffect(() => {
    getTemplates()
      .then((r) => setModeles((r.data || []).filter((m) => String(m.doc_type || "").toUpperCase() === "FACTURE")))
      .catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try { const r = await saveShopSettings(form); await Promise.resolve(r); onSaved?.({ ...form }); }
    catch (e) { onError?.(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Réglages de facturation">
      <div className="row2">
        <div className="field"><label>Préfixe de numéro</label>
          <input className="inp" value={form.invoice_prefix} onChange={set("invoice_prefix")} placeholder="F" /></div>
        <div className="field"><label>Prochain numéro</label>
          <input className="inp" type="number" min="1" value={form.next_number} onChange={set("next_number")} /></div>
      </div>
      <p className="sub" style={{ marginTop: 0 }}>Exemple de numéro : <span className="mono">{form.invoice_prefix}-{new Date().getFullYear()}-{String(form.next_number).padStart(4, "0")}</span></p>
      <div className="field"><label>Moyens de paiement (séparés par des virgules)</label>
        <input className="inp" value={form.payment_methods} onChange={set("payment_methods")} placeholder="Espèces,CB,Virement,Chèque" /></div>
      <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={form.tva_applies} onChange={(e) => setForm((p) => ({ ...p, tva_applies: e.target.checked }))} />
        Appliquer la TVA (décochez pour une facturation exonérée)
      </label>

      {/* Mise en page de la facture. Par défaut celle de l'application ; un modèle permet d'y
          mettre son logo, ses conditions, sa présentation. Le fichier Factur-X reste attaché
          dans les deux cas — il est normé, il ne se met pas en page. */}
      {/* Le choix est EXPLICITE. Le déduire du seul type ne tient pas dès qu'un organisme a
          plusieurs modèles FACTURE qui ne se distinguent pas par une condition — facture de
          formation et facture de boutique, par exemple. Le choix serait alors décidé par un
          ordre d'affichage que personne ne pense à regarder. */}
      <div className="field"><label>Modèle de facture par défaut</label>
        <select className="inp" value={form.invoice_template_slug}
          onChange={(e) => setForm((p) => ({ ...p, invoice_template_slug: e.target.value }))}>
          <option value="">— Aucun —</option>
          {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label || m.slug}</option>)}
        </select>
        <p className="hint" style={{ margin: "4px 0 0" }}>
          {modeles.length === 0
            ? "Aucun modèle de type FACTURE n'existe. Créez-le dans Modèles de documents : sans lui, aucune facture ne peut être éditée."
            : form.invoice_template_slug
              ? "Le PDF est composé à partir de ce modèle. Le fichier Factur-X y reste attaché, conforme."
              : modeles.length === 1
                ? "Un seul modèle de type FACTURE existe : il sera utilisé même sans être désigné ici."
                : "Plusieurs modèles de type FACTURE existent : désignez celui qui doit servir de facture."}
        </p>
      </div>
      <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les réglages"}</button>
    </Card>
  );
}
