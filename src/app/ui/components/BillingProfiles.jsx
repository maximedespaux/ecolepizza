import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import Card from "./Card.jsx";
import {
  getEmitters, createEmitter, updateEmitter, deleteEmitter, reprendreNumerotation,
} from "../api/apiClient.js";
import { CATS, CA_SOURCES } from "../lib/compta.js";

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
  iban: "", bic: "", bank_name: "",
  number_format: "", tva_applies: 1, payment_methods: "", next_number: 1,
  // Gestion par entité (migration 212). Trois sources par défaut (comme avant) ; pas de cibles propres.
  revenue_inscriptions: 1, revenue_materiel: 1, revenue_divers: 1,
  cibles_actives: false, compta_targets: {}, compta_dividende: "",
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

function EmitterForm({ initial, onCancel, onSave, saving, gestionDispo }) {
  const [form, setForm] = useState(() => {
    const f = { ...VIDE, ...initial };
    // Sources de CA : 0/1, défaut 1 (une entité a tout, comme avant).
    for (const s of CA_SOURCES) f[s.champ] = initial && initial[s.champ] != null ? (initial[s.champ] ? 1 : 0) : 1;
    // Cibles : la base rend `compta_targets` en CHAÎNE JSON ; l'écran les veut en objet de chaînes.
    const t = {};
    if (initial && initial.compta_targets) {
      try { const o = JSON.parse(initial.compta_targets); for (const c of CATS) if (o[c.v] != null) t[c.v] = String(o[c.v]); } catch { /* chaîne illisible : on repart de zéro */ }
    }
    f.compta_targets = t;
    f.compta_dividende = initial && initial.compta_dividende != null ? String(initial.compta_dividende) : "";
    f.cibles_actives = !!(initial && (initial.compta_targets || initial.compta_dividende != null));
    return f;
  });
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
          {/* Chips à insérer : tintées et marquées d'un +, pour qu'on VOIE qu'elles se cliquent. */}
          <div className="hint" style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 5px" }}>
            <Icon name="plus" size={12} /> Cliquez un jeton pour l'insérer :
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {JETONS_NUMERO.map(([tok, ex]) => (
              <button key={tok} type="button" className="btn sm" onClick={() => insererJeton(tok)}
                title={`Insérer ${tok}`}
                style={{
                  fontSize: 12, cursor: "pointer",
                  background: "var(--blue-bg)", borderColor: "var(--blue)", color: "var(--blue)",
                }}>
                <Icon name="plus" size={11} /> <span className="mono">{tok}</span>
                <span style={{ opacity: 0.7 }}>{ex}</span>
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            Entre les jetons, tapez vos séparateurs (<span className="mono">. - / _</span>) au clavier.
            <b> {"{SEQ}"} est obligatoire</b> : c'est le numéro qui change à chaque facture.
          </p>
        </div>
        <label className="field" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={!!form.tva_applies} onChange={(e) => set("tva_applies", e.target.checked ? 1 : 0)} />
          Appliquer la TVA (décochez pour une facturation exonérée)
        </label>

        {/* GESTION PAR ENTITÉ (migration 212) : lue par la Comptabilité quand cette entité est
            sélectionnée. Masquée tant que la migration n'est pas jouée (les champs seraient ignorés). */}
        {gestionDispo && (
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-soft)", paddingTop: 14, marginTop: 4 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>Sources de chiffre d'affaires (Comptabilité)</label>
            <p className="hint" style={{ margin: "0 0 8px" }}>
              Les sources que cette entité a. Sur la Comptabilité, quand on la sélectionne, les sources décochées sont
              masquées (ex. une boutique ne fait que de la vente de matériel). Une source avec un montant réel reste
              toujours affichée.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {CA_SOURCES.map((s) => (
                <label key={s.champ} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!form[s.champ]} onChange={(e) => set(s.champ, e.target.checked ? 1 : 0)} />
                  {s.label}
                </label>
              ))}
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.cibles_actives} onChange={(e) => set("cibles_actives", e.target.checked)} />
              <b>Cibles de gestion propres à cette entité</b>
            </label>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Sinon, cette entité suit les cibles globales de l'organisme (réglées sur la page Comptabilité).
            </p>
            {form.cibles_actives && (
              <div style={{ marginTop: 10, display: "grid", gap: 8, maxWidth: 420 }}>
                {CATS.map((c) => (
                  <div key={c.v} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{c.label}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input className="inp" style={{ width: 64, padding: "4px 6px" }} inputMode="decimal" aria-label={`Cible ${c.label}`}
                        value={form.compta_targets[c.v] ?? ""}
                        onChange={(e) => set("compta_targets", { ...form.compta_targets, [c.v]: e.target.value })} />%
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                  <b style={{ fontSize: 13 }}>Dividendes visés</b>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <input className="inp" style={{ width: 64, padding: "4px 6px" }} inputMode="decimal" aria-label="Dividendes visés"
                      value={form.compta_dividende} onChange={(e) => set("compta_dividende", e.target.value)} />% du CA
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="sub" style={{ margin: "4px 0 0" }}>
        Prochain numéro : <span className="mono">{apercuNumero(form.number_format, form.next_number || 1)}</span>
        {form.number_format && !/\{SEQ(?::\d+)?\}/.test(form.number_format)
          ? <span style={{ color: "var(--ember1)" }}>il manque {"{SEQ}"}</span> : null}
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
  const [editing, setEditing] = useState(null); // objet en cours d'édition, ou "new", ou null
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => getEmitters().then((r) => setRows(r.data || [])).catch((e) => onError?.(e.message));
  useEffect(() => { load(); }, []);

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
  async function remove(row) {
    if (!window.confirm(`Supprimer l'entité « ${row.label || row.legal_name} » ?\nLes factures déjà émises sous ce nom sont conservées.`)) return;
    try { await deleteEmitter(row.id); load(); } catch (e) { onError?.(e.message); }
  }
  /* REPRENDRE LA NUMÉROTATION (2026-09-30). Des documents supprimés ont laissé des numéros derrière
     le compteur — « FACT-2026-0009 » à venir, sans FACT-2026-0008. Un brouillon supprimé rend
     désormais son numéro tout seul ; ceci rattrape les suppressions d'avant, entité par entité. Le
     compteur ne se tape pas : il ne sait que revenir juste après le dernier document qui existe, ce
     que le serveur recalcule. Redonner un numéro est une décision — d'où la question. */
  async function reprendre(row) {
    const premier = apercuNumero(row.number_format, Number(row.sequence_max) + 1);
    const dernier = apercuNumero(row.number_format, Number(row.next_number) - 1);
    const plage = premier === dernier ? `Le numéro ${premier} sera redonné` : `Les numéros ${premier} à ${dernier} seront redonnés`;
    if (!window.confirm(`Reprendre la numérotation de « ${row.label || row.legal_name} » à ${premier} ?\n${plage} aux prochains documents. À ne faire que s'ils n'ont jamais été remis à un client (brouillons ou essais supprimés).`)) return;
    setMsg(null);
    try {
      const r = await reprendreNumerotation(row.id);
      setMsg({ type: "success", text: r.message || "Numérotation reprise." });
      load();
    } catch (e) { onError?.(e.message); }
  }

  return (
    <Card title={<span className="card-ttl"><Icon name="building" size={16} /> Entités émettrices</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Les identités sous lesquelles tu factures. Une entité distincte a son SIRET, sa TVA et sa
        numérotation propres, le PDF <b>et</b> le fichier Factur-X portent alors cette identité.
        L'entité « par défaut » s'applique seule ; tu peux la changer à chaque vente ou facture.
      </p>
      {msg && <p className={"hint"} style={{ color: "var(--green)" }}>{msg.text}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
            <Icon name={r.is_organization ? "star" : "building"} size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{r.label || r.legal_name}</b>
              {r.is_organization ? <span className="badge b" style={{ marginLeft: 8 }}>organisme</span> : null}
              {r.is_default ? <span className="badge g" style={{ marginLeft: 8 }}>par défaut</span> : null}
              <div className="hint" style={{ fontSize: 12 }}>
                {r.legal_name} · {r.siret || "SIRET, "} · <span className="mono">{apercuNumero(r.number_format, r.next_number || 1)}</span>
              </div>
              {/* Des numéros donnés n'existent plus (documents supprimés) : l'entité peut les reprendre. */}
              {r.sequence_max != null && Number(r.next_number) - 1 > Number(r.sequence_max) && (
                <div className="hint" style={{ fontSize: 12 }}>
                  {Number(r.sequence_max) > 0
                    ? <>Son dernier document porte le n° <span className="mono">{apercuNumero(r.number_format, r.sequence_max)}</span>.</>
                    : "Aucun document ne porte encore un de ses numéros."}{" "}
                  <button type="button" className="lien-nu" onClick={() => reprendre(r)}>
                    Reprendre à {apercuNumero(r.number_format, Number(r.sequence_max) + 1)}
                  </button>
                </div>
              )}
            </div>
            <button className="btn ghost sm" onClick={() => setEditing(r)}><Icon name="settings" size={13} /></button>
            {/* L'entité organisme n'est pas supprimable : c'est l'émetteur de base. */}
            {!r.is_organization && <button className="iconbtn" onClick={() => remove(r)} aria-label="Supprimer"><Icon name="x" size={14} /></button>}
          </div>
        ))}
        {rows.length === 0 && <p className="hint">Aucune entité émettrice : les factures sortent sous l'identité de l'organisme.</p>}
      </div>

      {editing ? (
        <EmitterForm
          initial={editing === "new" ? {} : editing}
          saving={saving}
          /* Les champs de gestion par entité (212) ne s'affichent que si la colonne existe —
             sinon ils seraient enregistrés dans le vide. On le déduit des lignes lues. */
          gestionDispo={rows.length === 0 || rows.some((r) => "revenue_materiel" in r)}
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
