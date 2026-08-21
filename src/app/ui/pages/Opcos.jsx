import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getOpcos, createOpco, updateOpco, deleteOpco } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DataTable from "../components/DataTable.jsx";

function Opcos() {
  // `null` et non `[]` : c'est la convention que `DataTable` attend — `null` fait afficher le
  // squelette, `[]` l'état vide. Initialisée à `[]`, la page annonçait « Aucun OPCO » pendant
  // toute la durée du chargement.
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // opco en édition, ou { _new:true }
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState("actifs"); // actifs | tous | inactifs

  /* CE QU'ON VIENT CHERCHER ICI : un numéro, une adresse, un site — sur un référentiel qui
     compte déjà dix-huit financeurs et qui ne fait que grandir. Il n'y avait AUCUNE recherche :
     on faisait défiler et on lisait. Toutes les autres listes de l'application en ont une
     (Stagiaires, Partenaires, Journal d'audit) ; celle-ci était la seule à s'en passer.
     La recherche porte sur ce qu'on a en tête quand on arrive — un nom, un code, une ville —
     mais AUSSI sur le téléphone et l'e-mail : on cherche parfois « qui est ce numéro ? ». */
  const filtres = useMemo(() => {
    if (!items) return null;
    const t = q.trim().toLowerCase();
    return items.filter((o) => {
      if (etat === "actifs" && !o.active) return false;
      if (etat === "inactifs" && o.active) return false;
      if (!t) return true;
      return [o.name, o.code, o.town, o.zip_code, o.email, o.phone, o.website, o.siret]
        .some((v) => String(v || "").toLowerCase().includes(t));
    });
  }, [items, q, etat]);

  async function load() {
    try { const { data } = await getOpcos(); setItems(data); }
    catch (e) { setItems([]); setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function onDelete(o) {
    if (!window.confirm(`Supprimer « ${o.name} » du référentiel ?`)) return;
    try { await deleteOpco(o.id); setStatus({ type: "success", message: "OPCO supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="OPCO / financeurs"
        lead="Coordonnées des financeurs, reprises dans les fiches stagiaires et entreprises."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true, active: 1, triggers_assiduite: 0 })}>＋ Nouvel OPCO</button>}
      />
      <StatusMessage status={status} />

      {/* Même barre que partout ailleurs (`filtres` + `gs-search` + `seg`) : une page de
          référentiel qui se cherche autrement que ses voisines oblige à réapprendre. */}
      <div className="filtres">
        <span className="gs-search" style={{ flex: 1, minWidth: 220 }}>
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher un financeur"
            placeholder="Rechercher (nom, code, ville, téléphone, e-mail…)" />
          {q && <button className="gs-clear" title="Effacer" aria-label="Effacer la recherche" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
        </span>
        {/* Un OPCO désactivé reste dans le référentiel — il figure encore dans d'anciens
            dossiers — mais on ne le cherche presque jamais. Il est donc masqué PAR DÉFAUT et
            non plus mêlé aux autres en demi-teinte : « actif » est la question qu'on se pose. */}
        <span className="seg">
          {[["actifs", "Actifs"], ["tous", "Tous"], ["inactifs", "Désactivés"]].map(([v, l]) => (
            <button key={v} type="button" className={"seg-btn" + (etat === v ? " on" : "")} onClick={() => setEtat(v)}>{l}</button>
          ))}
        </span>
      </div>

      <Card title={`OPCO / financeurs${filtres && items ? (filtres.length === items.length ? ` (${items.length})` : ` (${filtres.length} sur ${items.length})`) : ""}`}>
        {/* `dt-discret` : ce référentiel est PRÉ-REMPLI et pratiquement jamais modifié — on
            l'ouvre pour LIRE un numéro ou une adresse. Ses quarante-deux commandes d'édition
            s'affichaient pourtant en permanence, au même poids que les coordonnées. Elles
            restent dans le document — donc atteignables au clavier et annoncées aux lecteurs
            d'écran — mais s'effacent visuellement jusqu'au survol de leur ligne. */}
        <DataTable
          className="dt-discret"
          rows={filtres}
          rowKey={(o) => o.id}
          // Un OPCO désactivé n'est plus mêlé aux autres en demi-teinte (il est masqué par
          // défaut) ; quand on demande à le voir, il porte son étiquette au lieu d'un gris
          // qu'on pouvait prendre pour un défaut d'affichage.
          /* TROIS impasses différentes, trois messages. « Aucun résultat » suivi d'un conseil
             hors sujet — « essaie un autre terme » quand on n'en a saisi aucun — laisse chercher
             ce qu'on a mal tapé alors que c'est le filtre d'état qui vide la liste. */
          vide={q
            ? <EmptyState icon="search" title="Aucun résultat"
                text={`Aucun financeur ne correspond à « ${q.trim()} »${etat === "actifs" ? " parmi les actifs. Essaie un autre terme, ou affiche « Tous »." : ". Essaie un autre terme."}`} />
            : etat !== "actifs"
              ? <EmptyState icon="euro" title={etat === "inactifs" ? "Aucun financeur désactivé" : "Aucun OPCO"}
                  text={etat === "inactifs"
                    ? "Tous les financeurs du référentiel sont actifs : c'est plutôt bon signe."
                    : "Le référentiel est vide."} />
              : <EmptyState icon="euro" title="Aucun OPCO"
                  text="Le référentiel est vide. Ajoute les financeurs que tu rencontres : ils apparaîtront ensuite dans les fiches stagiaires et entreprises." />}
          cols={[
            { k: "name", t: "Nom", principal: true,
              cell: (o) => (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <b>{o.name}</b>
                    {/* « Assiduité » occupait une COLONNE entière pour un tiret sur dix-sept
                        lignes. L'information compte — elle déclenche une attestation — mais
                        elle qualifie le financeur, elle ne mérite pas un quart de la largeur.
                        Elle revient ici, en étiquette, là où on lit son nom. */}
                    {o.triggers_assiduite ? <Badge tone="a">Attestation</Badge> : null}
                    {!o.active ? <Badge tone="n">Désactivé</Badge> : null}
                  </span>
                  {o.code && <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{o.code}</span>}
                </>
              ) },
            { k: "ville", t: "Ville", td: { fontSize: 13 },
              cell: (o) => [o.zip_code, o.town].filter(Boolean).join(" ") || <span className="hint">-</span> },
            /* LE DÉFAUT LE PLUS COÛTEUX DE CETTE PAGE : téléphone, e-mail et site étaient
               concaténés en UNE chaîne de texte, séparés par des points médians. Sur un écran
               dont la raison d'être est « trouver le numéro d'un financeur », on ne pouvait ni
               appeler, ni écrire, ni ouvrir le site — il fallait sélectionner et recopier.
               Trois données distinctes, trois liens. */
            { k: "tel", t: "Téléphone", td: { whiteSpace: "nowrap", fontSize: 13 },
              cell: (o) => (o.phone ? <a href={`tel:${String(o.phone).replace(/\s+/g, "")}`}>{o.phone}</a> : <span className="hint">-</span>) },
            { k: "contact", t: "Contact", td: { fontSize: 13 },
              cell: (o) => {
                const site = o.website && (o.website.startsWith("http") ? o.website : `https://${o.website}`);
                if (!o.email && !site) return <span className="hint">-</span>;
                return (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    {o.email && <a href={`mailto:${o.email}`} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.email}</a>}
                    {site && <a href={site} target="_blank" rel="noreferrer" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.website}</a>}
                  </span>
                );
              } },
            { k: "actions", t: "", actions: true, th: { width: 1 }, td: { textAlign: "right", whiteSpace: "nowrap" },
              cell: (o) => (
                <>
                  {/* Icône plutôt que le mot « Éditer » : c'est la forme retenue partout
                      ailleurs (Équipe, Partenaires, Inventaire), et deux commandes de même
                      nature doivent se ressembler. Le nom accessible, lui, reste explicite. */}
                  <button className="iconbtn" title="Modifier" aria-label={`Modifier ${o.name}`} onClick={() => setEditing({ ...o })}><Icon name="pencil" size={15} /></button>{" "}
                  <button className="iconbtn del" title="Supprimer" aria-label={`Supprimer ${o.name}`} onClick={() => onDelete(o)}><Icon name="trash" size={15} /></button>
                </>
              ) },
          ]}
        />
      </Card>

      {editing && (
        <OpcoModal
          opco={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "OPCO enregistré." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

function OpcoModal({ opco, onClose, onSaved, onError }) {
  const isNew = !!opco._new;
  const [f, setF] = useState({
    code: opco.code || "", name: opco.name || "", siret: opco.siret || "", address: opco.address || "",
    zip_code: opco.zip_code || "", town: opco.town || "", email: opco.email || "",
    phone: opco.phone || "", website: opco.website || "",
    triggers_assiduite: !!opco.triggers_assiduite, active: opco.active == null ? true : !!opco.active,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { onError("Nom requis."); return; }
    setSaving(true);
    try {
      if (isNew) await createOpco(f); else await updateOpco(opco.id, f);
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{isNew ? "Nouvel OPCO" : "Modifier l'OPCO"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          <div className="row2">
            <Field label="Nom" value={f.name} onChange={set("name")} />
            <Field label="Code" value={f.code} onChange={set("code")} />
          </div>
          <div className="row2">
            <Field label="SIRET" value={f.siret} onChange={set("siret")} placeholder="propre au financeur (≠ organisme)" />
            <span />
          </div>
          <Field label="Adresse" value={f.address} onChange={set("address")} />
          <div className="row3">
            <Field label="Code postal" value={f.zip_code} onChange={set("zip_code")} />
            <Field label="Ville" value={f.town} onChange={set("town")} />
            <Field label="Téléphone" value={f.phone} onChange={set("phone")} />
          </div>
          <div className="row2">
            <Field label="Email" type="email" value={f.email} onChange={set("email")} />
            <Field label="Site web" value={f.website} onChange={set("website")} />
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={f.triggers_assiduite} onChange={(e) => setF((p) => ({ ...p, triggers_assiduite: e.target.checked }))} /> Déclenche l'attestation d'assiduité
            </label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={f.active} onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))} /> Actif
            </label>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default Opcos;
