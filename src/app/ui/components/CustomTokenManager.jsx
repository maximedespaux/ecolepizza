import { useEffect, useMemo, useRef, useState } from "react";
import { getCustomTokens, saveCustomTokens } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
/* L'aperçu calcule avec le MÊME code que le serveur (copie conforme, vérifiée par un test) : la
   version locale qui vivait ici ne savait que décaler des dates, et affichait « {Prix|-450} »
   inchangé pendant que le document soustrayait. */
import { applyTemplate } from "../lib/jetonsPerso.js";

const slug = (s) => String(s || "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

/**
 * Gestionnaire des jetons personnalisés : chaque jeton = un nom + un modèle qui combine
 * d'autres jetons ({Jour1}, {field:…}, {custom:…}) et du texte, avec calcul : décalage de date
 * ({endDate|-1}), montant ajusté ({Prix|-450}), multiplié ({Prix|*20%}) ou divisé ({Prix|/3}).
 * `catalog` = groupes de jetons disponibles (références insérables).
 */
export default function CustomTokenManager({ catalog, onClose, onSaved }) {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refFilter, setRefFilter] = useState(""); // filtre des références par table d'origine
  const focusRef = useRef({ idx: null });
  const taRef = useRef(null); // textarea « Modèle » actuellement focalisé

  useEffect(() => {
    getCustomTokens().then((r) => setList((r.data || []).map((t) => ({ ...t })))).catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  // Valeurs d'exemple issues du catalogue, pour l'aperçu.
  const sampleMap = useMemo(() => {
    const m = {};
    for (const g of catalog || []) for (const t of g.tokens || []) m[t.key] = t.sample || "";
    // les jetons personnalisés peuvent se référencer entre eux
    for (const t of list) if (t.token_key) m["custom:" + t.token_key] = applyTemplate(t.template, m);
    return m;
  }, [catalog, list]);

  const setRow = (i, patch) => setList((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const add = () => setList((l) => [...l, { token_key: "", label: "", category: "", template: "" }]);
  const remove = (i) => setList((l) => l.filter((_, j) => j !== i));
  // Catégories proposées = groupes de la palette (le jeton se rangera dans ce groupe).
  const categoryOptions = useMemo(() => {
    const set = [];
    for (const g of catalog || []) if (g.group && g.group !== "Personnalisés" && !set.includes(g.group)) set.push(g.group);
    return set;
  }, [catalog]);

  // Insertion AU CURSEUR dans le champ « Modèle » focalisé. `caretMid` = position du
  // curseur (relative au texte inséré) — pour laisser le curseur ENTRE deux marqueurs.
  function insertAtCursor(str, caretMid) {
    const { idx } = focusRef.current;
    if (idx == null) { setStatus({ type: "error", message: "Cliquez d'abord dans un champ « Modèle »." }); return; }
    const ta = taRef.current;
    const cur = list[idx]?.template || "";
    const start = ta && ta.selectionStart != null ? ta.selectionStart : cur.length;
    const end = ta && ta.selectionEnd != null ? ta.selectionEnd : start;
    setRow(idx, { template: cur.slice(0, start) + str + cur.slice(end) });
    const caret = start + (caretMid != null ? caretMid : str.length);
    requestAnimationFrame(() => { if (ta) { ta.focus(); try { ta.setSelectionRange(caret, caret); } catch { /* ignore */ } } });
  }
  const insertRef = (key) => insertAtCursor(`{${key}}`);
  // Bloc « par stagiaire » : insère les marqueurs, curseur placé ENTRE eux.
  const insertBlock = () => insertAtCursor("{#Stagiaires}{/Stagiaires}", "{#Stagiaires}".length);

  async function save() {
    setSaving(true); setStatus(null);
    try {
      const tokens = list.filter((t) => slug(t.token_key)).map((t) => ({ token_key: slug(t.token_key), label: t.label || slug(t.token_key), category: t.category || "", template: t.template || "" }));
      await saveCustomTokens(tokens);
      setStatus({ type: "success", message: "Jetons personnalisés enregistrés." });
      onSaved?.();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 820, width: "94%" }}>
        <div className="mhead">
          <h3>Jetons personnalisés</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody" style={{ maxHeight: "72vh", overflow: "auto" }}>
          <p className="sub" style={{ margin: "0 0 8px" }}>
            Combine jetons et texte. Dates, en jours : <code>{"{Jour1|+30}"}</code>, <code>{"{endDate|-1}"}</code>.
            Montants : <code>{"{Prix|-450}"}</code>, <code>{"{Prix|*20%}"}</code> (20 % du prix),{" "}
            <code>{"{Prix|*90%}"}</code> (remise de 10 %), <code>{"{Prix|/3}"}</code> (un tiers).
          </p>
          {status && <div className={"status " + (status.type || "")} style={{ marginBottom: 8 }}>{status.message}</div>}

          <div className="tablewrap">
            <table>
              <thead><tr><th style={{ width: 140 }}>Nom (clé)</th><th style={{ width: 160 }}>Libellé</th><th style={{ width: 150 }}>Catégorie</th><th>Modèle</th><th style={{ width: 130 }}>Aperçu</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={i}>
                    <td><input className="inp" value={t.token_key} onChange={(e) => setRow(i, { token_key: e.target.value })} placeholder="Periode" /></td>
                    <td><input className="inp" value={t.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="Période de formation" /></td>
                    <td>
                      <select className="inp" value={t.category || ""} onChange={(e) => setRow(i, { category: e.target.value })} title="Groupe où ranger ce jeton (défaut : Personnalisé)">
                        <option value="">Personnalisé</option>
                        {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <textarea className="inp" rows={2} value={t.template} style={{ resize: "vertical", width: "100%" }}
                        onFocus={(e) => { focusRef.current = { idx: i }; taRef.current = e.target; }}
                        onChange={(e) => setRow(i, { template: e.target.value })} placeholder="du {Jour1} au {endDate}" />
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>{applyTemplate(t.template, sampleMap) || "-"}</td>
                    <td><button className="btn sm ghost danger" onClick={() => remove(i)} title="Supprimer"><Icon name="x" size={13} /></button></td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={6} className="hint" style={{ padding: 12 }}>Aucun jeton personnalisé. Ajoutez-en un.</td></tr>}
              </tbody>
            </table>
          </div>
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={add}>＋ Ajouter un jeton</button>

          <div style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <button type="button" className="tok-chip" title="Insère un bloc {#Stagiaires} … {/Stagiaires} (répété par stagiaire), placez ensuite les jetons « par stagiaire » entre les marqueurs"
                onClick={insertBlock}>
                <Icon name="plus" size={13} /> Bloc « par stagiaire »
              </button>
              {/* « (groupe Entreprise) » renvoyait à un groupe qui s'appelle « Groupe entreprise », et
                  ne disait ni à quoi sert le bloc, ni pourquoi les MÊMES noms (Prénom, Nom…) figurent
                  aussi dans le groupe Stagiaire. */}
              <p className="sub" style={{ fontSize: 11, margin: "6px 0 0" }}>
                Pour un document d'entreprise : ce qui est placé entre <code>{"{#Stagiaires}"}</code> et{" "}
                <code>{"{/Stagiaires}"}</code> se répète pour chacun de ses stagiaires. Cliquez ensuite dans le
                bloc les informations à répéter, prises dans le groupe <b>« Groupe entreprise »</b> ci-dessous.
                Hors du bloc, Prénom, Nom… désignent le stagiaire du dossier.
              </p>
            </div>
            <div className="hf-label" style={{ padding: "0 0 6px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>Insérer une référence <span style={{ textTransform: "none", fontWeight: 400 }}>· cliquez dans un « Modèle » puis sur un champ</span></span>
              <select className="inp" style={{ marginLeft: "auto", maxWidth: 220, fontSize: 12 }} value={refFilter} onChange={(e) => setRefFilter(e.target.value)}>
                <option value="">Toutes les tables</option>
                {(catalog || []).map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 160, overflow: "auto" }}>
              {(catalog || []).filter((g) => !refFilter || g.group === refFilter).map((g) => g.tokens.map((t) => (
                <button key={t.key} type="button" className="tok-chip" title={`{${t.key}}`} onClick={() => insertRef(t.key)}>{t.label}</button>
              )))}
            </div>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
