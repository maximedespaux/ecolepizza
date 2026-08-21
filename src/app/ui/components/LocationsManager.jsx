import { useEffect, useState } from "react";
import { getLocations, saveLocations } from "../api/apiClient.js";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";

// Gestion des lieux de formation de l'organisme (plusieurs adresses possibles).
export default function LocationsManager() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocations().then((r) => setList(r.data || [])).catch((e) => setStatus({ type: "error", message: e.message })); }, []);

  const setRow = (i, patch) => setList((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const add = () => setList((l) => [...l, { name: "", address: "", zip_code: "", town: "" }]);
  const remove = (i) => setList((l) => l.filter((_, j) => j !== i));

  async function save() {
    setSaving(true); setStatus(null);
    try {
      await saveLocations(list.filter((l) => (l.name || "").trim()));
      const r = await getLocations(); setList(r.data || []); // relit (ids à jour)
      setStatus({ type: "success", message: "Lieux enregistrés." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Lieux de formation">
      <p className="sub" style={{ marginTop: 0 }}>
        Adresses où se déroulent vos formations. Une session peut être rattachée à un lieu ; ses champs sont insérables dans les documents (jetons <b>Lieu de formation</b> : {"{field:location.name}"}, {"{field:location.address}"}…).
      </p>
      {status && <div className={"status " + (status.type || "")} style={{ marginBottom: 8 }}>{status.message}</div>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Nom du lieu</th><th>Adresse</th><th style={{ width: 110 }}>Code postal</th><th style={{ width: 160 }}>Ville</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {list.map((l, i) => (
              <tr key={i}>
                {/* Ces champs n'avaient QUE leur placeholder pour étiquette. Un placeholder
                    disparaît dès la première frappe : à la relecture d'un formulaire rempli,
                    plus rien ne dit quelle case contient quoi. L'en-tête de colonne joue ce
                    rôle à l'œil, mais rien ne le relie au champ — d'où `aria-label`, qui
                    nomme la colonne ET la ligne. */}
                <td><input className="inp" aria-label={`Nom du lieu, ligne ${i + 1}`} value={l.name || ""} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Centre Bordeaux" /></td>
                <td><input className="inp" aria-label={`Adresse${l.name ? ` de ${l.name}` : `, ligne ${i + 1}`}`} value={l.address || ""} onChange={(e) => setRow(i, { address: e.target.value })} placeholder="12 rue des Fours" /></td>
                <td><input className="inp" aria-label={`Code postal${l.name ? ` de ${l.name}` : `, ligne ${i + 1}`}`} value={l.zip_code || ""} onChange={(e) => setRow(i, { zip_code: e.target.value })} placeholder="33000" /></td>
                <td><input className="inp" aria-label={`Ville${l.name ? ` de ${l.name}` : `, ligne ${i + 1}`}`} value={l.town || ""} onChange={(e) => setRow(i, { town: e.target.value })} placeholder="Bordeaux" /></td>
                <td><button className="btn sm ghost danger" onClick={() => remove(i)} title="Supprimer" aria-label={`Supprimer le lieu${l.name ? ` ${l.name}` : ` de la ligne ${i + 1}`}`}><Icon name="x" size={13} /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="hint" style={{ padding: 12 }}>Aucun lieu. Ajoutez-en un.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn sm ghost" onClick={add}>＋ Ajouter un lieu</button>
        <button className="btn primary" style={{ marginLeft: "auto" }} disabled={saving} onClick={save}>{saving ? "…" : "Enregistrer les lieux"}</button>
      </div>
    </Card>
  );
}
