import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import Card from "./Card.jsx";
import {
  getEmitters, createEmitter, updateEmitter, setDefaultEmitter, deleteEmitter, getTemplates,
} from "../api/apiClient.js";

/**
 * Gestion des ENTITÉS ÉMETTRICES — les identités de vendeur sous lesquelles l'organisme facture.
 *
 * Une entité émettrice est une identité RÉELLE et COMPLÈTE, pas une étiquette de nom : son
 * SIRET, sa TVA et son adresse partent dans le XML Factur-X. Le formulaire réclame donc la
 * raison sociale (obligatoire) et rassemble tout ce qu'une facture doit porter. Le préfixe de
 * numéro doit différer d'une entité à l'autre — chacune tient sa propre séquence.
 *
 * L'organisme reste l'émetteur par défaut du code tant qu'aucune entité n'existe : cet écran
 * n'est utile qu'à qui facture sous PLUSIEURS identités.
 */

const VIDE = {
  label: "", legal_name: "", legal_status: "", capital: "", rcs: "", siret: "", vat_number: "",
  naf_ape: "", nda: "", address: "", zip_code: "", town: "", email: "", phone: "",
  iban: "", bic: "", bank_name: "", default_template_slug: "",
  number_format: "", tva_applies: 1, payment_methods: "", next_number: 1,
};

/**
 * Aperçu d'un numéro selon le gabarit — le même expanseur que le serveur, en miniature. Montre
 * tout de suite à quoi ressemblera « TXT.{YYYY}.901.{SEQ:4} ». Sans {SEQ}, on le signale.
 */
function apercuNumero(format, seq) {
  const d = new Date();
  const pad = (n, w) => String(n).padStart(w, "0");
  const fmt = (format && format.trim()) || "F-{YYYY}-{SEQ}";
  return fmt
    .replace(/\{PREFIX\}/g, "F") // rétro-compat : les formats existants gardent leur {PREFIX}
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{YY\}/g, pad(d.getFullYear() % 100, 2))
    .replace(/\{MM\}/g, pad(d.getMonth() + 1, 2))
    .replace(/\{DD\}/g, pad(d.getDate(), 2))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_, w) => pad(seq || 1, w ? Number(w) : 4));
}

function Champ({ label, k, form, set, ph, wide }) {
  return (
    <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      <input className="inp" value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  );
}

// Les jetons du numéro, chacun avec un exemple parlant. Insérés en un clic — on ne tape plus les
// accolades à la main. {SEQ} d'abord : c'est le seul obligatoire, il doit sauter aux yeux.
// Moyens de paiement courants, proposés en cases à cocher. La valeur reste une liste séparée
// par des virgules — les cases ne font que la composer, pour ne plus la taper à la main.
const PAIEMENTS_STD = ["Espèces", "CB", "Virement", "Chèque"];

function PaiementPicker({ value, onChange }) {
  const choisis = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
  // On affiche les standards PLUS tout mode déjà enregistré hors standard, pour ne rien perdre
  // d'une saisie antérieure.
  const options = [...PAIEMENTS_STD, ...choisis.filter((c) => !PAIEMENTS_STD.includes(c))];
  const [autre, setAutre] = useState("");

  const toggle = (m) => {
    const next = choisis.includes(m) ? choisis.filter((x) => x !== m) : [...choisis, m];
    onChange(next.join(","));
  };
  const ajouter = () => {
    const m = autre.trim();
    if (m && !choisis.includes(m)) onChange([...choisis, m].join(","));
    setAutre("");
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((m) => (
          <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={choisis.includes(m)} onChange={() => toggle(m)} /> {m}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input className="inp" style={{ maxWidth: 200 }} value={autre} placeholder="Autre moyen…"
          onChange={(e) => setAutre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} />
        <button type="button" className="btn ghost sm" onClick={ajouter} disabled={!autre.trim()}>Ajouter</button>
      </div>
    </div>
  );
}

const JETONS_NUMERO = [
  ["{SEQ}", "N° 0001"],
  ["{SEQ:5}", "N° 00001"],
  ["{YYYY}", "Année 2026"],
  ["{YY}", "Année 26"],
  ["{MM}", "Mois"],
  ["{DD}", "Jour"],
];

function EmitterForm({ initial, modeles, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => ({ ...VIDE, ...initial }));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const formatOk = !form.number_format || /\{SEQ(?::\d+)?\}/.test(form.number_format);

  // Insère un jeton à l'endroit du curseur (ou en bout), et replace le curseur après lui — pour
  // qu'on enchaîne « {PREFIX} », un point, « {YYYY} »… sans jamais écrire d'accolade soi-même.
  const fmtRef = useRef(null);
  function insererJeton(tok) {
    const el = fmtRef.current;
    const cur = form.number_format || "";
    if (!el || el.selectionStart == null) { set("number_format", cur + tok); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    set("number_format", cur.slice(0, a) + tok + cur.slice(b));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + tok.length; });
  }

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--gold)", marginTop: 12 }}>
      <div className="grid cols-2" style={{ gap: 10 }}>
        <Champ label="Nom interne (pour choisir)" k="label" form={form} set={set} ph="Boutique, Centre de formation…" />
        <Champ label="Raison sociale *" k="legal_name" form={form} set={set} ph="Dénomination légale" />
        <Champ label="Forme juridique" k="legal_status" form={form} set={set} ph="SARL, SAS, EI…" />
        <Champ label="Capital social" k="capital" form={form} set={set} ph="10 000 €" />
        <Champ label="RCS + ville" k="rcs" form={form} set={set} ph="RCS Tarbes 879 955 136" wide />
        <Champ label="SIRET" k="siret" form={form} set={set} ph="879 955 136 00012" />
        <Champ label="N° TVA intracom." k="vat_number" form={form} set={set} ph="FR41879955136" />
        <Champ label="Code NAF/APE" k="naf_ape" form={form} set={set} ph="8559A" />
        <Champ label="N° déclaration d'activité" k="nda" form={form} set={set} ph="le cas échéant" />
        <Champ label="Adresse" k="address" form={form} set={set} wide />
        <Champ label="Code postal" k="zip_code" form={form} set={set} />
        <Champ label="Ville" k="town" form={form} set={set} />
        <Champ label="E-mail" k="email" form={form} set={set} ph="obligatoire pour Factur-X (BT-34)" />
        <Champ label="Téléphone" k="phone" form={form} set={set} />
        <Champ label="IBAN" k="iban" form={form} set={set} />
        <Champ label="BIC" k="bic" form={form} set={set} />
        <Champ label="Banque" k="bank_name" form={form} set={set} />
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Moyens de paiement (caisse)</label>
          <PaiementPicker value={form.payment_methods} onChange={(v) => set("payment_methods", v)} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Format du numéro de facture</label>
          <input ref={fmtRef} className="inp mono" value={form.number_format || ""}
            onChange={(e) => set("number_format", e.target.value)}
            placeholder={`Ex : FACT-{YYYY}-{SEQ}  donne  FACT-${new Date().getFullYear()}-0001`} />
          {/* Chips à insérer : on clique un jeton, on tape les séparateurs (. - /) au clavier. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 0" }}>
            {JETONS_NUMERO.map(([tok, ex]) => (
              <button key={tok} type="button" className="btn ghost sm" onClick={() => insererJeton(tok)}
                title={`Insérer ${tok}`} style={{ fontSize: 12 }}>
                <span className="mono">{tok}</span> <span className="hint">{ex}</span>
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            Clique un jeton pour l'insérer ; tape les séparateurs (<span className="mono">. - / .</span>) au clavier.
            <b> {"{SEQ}"} est obligatoire</b> — c'est le numéro qui change à chaque facture.
          </p>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Modèle de facture propre à cette entité</label>
          <select className="inp" value={form.default_template_slug || ""} onChange={(e) => set("default_template_slug", e.target.value)}>
            <option value="">— Le modèle de facture par défaut —</option>
            {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label || m.slug}</option>)}
          </select>
        </div>
        <label className="field" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={!!form.tva_applies} onChange={(e) => set("tva_applies", e.target.checked ? 1 : 0)} />
          Appliquer la TVA (décochez pour une facturation exonérée)
        </label>
      </div>
      <p className="sub" style={{ margin: "4px 0 0" }}>
        Prochain numéro : <span className="mono">{apercuNumero(form.number_format, form.next_number || 1)}</span>
        {form.number_format && !/\{SEQ(?::\d+)?\}/.test(form.number_format)
          ? <span style={{ color: "var(--ember1)" }}> — il manque {"{SEQ}"}</span> : null}
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn ghost sm" onClick={onCancel}>Annuler</button>
        <button className="btn primary sm" disabled={saving || !form.legal_name.trim() || !formatOk} onClick={() => onSave(form)}>
          <Icon name="check" size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

export default function BillingProfiles({ onError }) {
  const [rows, setRows] = useState([]);
  const [modeles, setModeles] = useState([]);
  const [editing, setEditing] = useState(null); // objet en cours d'édition, ou "new", ou null
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => getEmitters().then((r) => setRows(r.data || [])).catch((e) => onError?.(e.message));
  useEffect(() => {
    load();
    getTemplates()
      .then((r) => setModeles((r.data || []).filter((m) => String(m.doc_type || "").toUpperCase() === "FACTURE")))
      .catch(() => {});
  }, []);

  async function save(form) {
    setSaving(true); setMsg(null);
    try {
      if (editing === "new") await createEmitter(form);
      else await updateEmitter(editing.id, form);
      setEditing(null); load();
      setMsg({ type: "success", text: "Entité enregistrée." });
    } catch (e) { onError?.(e.message); }
    finally { setSaving(false); }
  }
  async function makeDefault(id) {
    try { await setDefaultEmitter(id); load(); } catch (e) { onError?.(e.message); }
  }
  async function remove(row) {
    if (!window.confirm(`Supprimer l'entité « ${row.label || row.legal_name} » ?\nLes factures déjà émises sous ce nom sont conservées.`)) return;
    try { await deleteEmitter(row.id); load(); } catch (e) { onError?.(e.message); }
  }

  return (
    <Card title={<span className="card-ttl"><Icon name="building" size={16} /> Entités émettrices</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Les identités sous lesquelles tu factures. Une entité distincte a son SIRET, sa TVA et sa
        numérotation propres — le PDF <b>et</b> le fichier Factur-X portent alors cette identité.
        L'entité « par défaut » s'applique seule ; tu peux la changer à chaque vente ou facture.
      </p>
      {msg && <p className={"hint"} style={{ color: "var(--green)" }}>{msg.text}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
            <Icon name="building" size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{r.label || r.legal_name}</b>
              {r.is_default ? <span className="badge g" style={{ marginLeft: 8 }}>par défaut</span> : null}
              <div className="hint" style={{ fontSize: 12 }}>
                {r.legal_name} · {r.siret || "SIRET —"} · <span className="mono">{apercuNumero(r.number_format, r.next_number || 1)}</span>
              </div>
            </div>
            {!r.is_default && <button className="btn ghost sm" onClick={() => makeDefault(r.id)} title="Utiliser par défaut">Par défaut</button>}
            <button className="btn ghost sm" onClick={() => setEditing(r)}><Icon name="settings" size={13} /></button>
            <button className="iconbtn" onClick={() => remove(r)} aria-label="Supprimer"><Icon name="x" size={14} /></button>
          </div>
        ))}
        {rows.length === 0 && <p className="hint">Aucune entité émettrice : les factures sortent sous l'identité de l'organisme.</p>}
      </div>

      {editing ? (
        <EmitterForm
          initial={editing === "new" ? {} : editing}
          modeles={modeles}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setEditing("new")}>
          <Icon name="plus" size={14} /> Ajouter une entité émettrice
        </button>
      )}
    </Card>
  );
}
