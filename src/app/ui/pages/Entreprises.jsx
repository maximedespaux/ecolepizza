import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getCompanies, createCompany } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ListePlus from "../components/ListePlus.jsx";
import { Icon } from "../components/Icon.jsx";
import { Requis } from "../components/Field.jsx";
import { useListeBornee } from "../lib/listeBornee.js";
import { dateFr } from "../lib/format.js";
import ReferentEntreprise from "../components/ReferentEntreprise.jsx";
import ImportCsv from "../components/ImportCsv.jsx";
import { nomReferent, referentAvecCivilite, messageReferentPerdu } from "../lib/referent.js";

/**
 * Entreprises — clients / financeurs de l'organisme. Une entreprise regroupe plusieurs
 * stagiaires (inscription de groupe). Cliquer une entreprise ouvre sa fiche (stagiaires,
 * inscription d'un groupe à une session).
 */
export default function Entreprises() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [creating, setCreating] = useState(false);
  const [importer, setImporter] = useState(false); // l'import CSV (2026-09-22)
  /* TRI DANS LA PAGE, PAS DANS LE TABLEAU. `DataTable` ne trie pas, et il ne le POURRAIT pas
     ici : la liste lui est passée déjà COUPÉE à `max` lignes (quatre cent soixante et onze
     entreprises, on n'en montre qu'une tranche). Trier à l'intérieur ne trierait que la tranche
     visible — « la plus récente » serait la plus récente DES CINQUANTE AFFICHÉES, ce qui est
     faux sans jamais en avoir l'air. */
  const [tri, setTri] = useState({ col: "name", sens: 1 });

  const load = () => getCompanies().then((r) => setRows(r.data || [])).catch((e) => setStatus({ type: "error", message: e.message }));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtrees = !q ? rows
      : rows.filter((c) => [c.name, c.siret, c.town, c.email, nomReferent(c)].some((f) => String(f || "").toLowerCase().includes(q)));
    /* Comparaison de CHAÎNES sur les dix premiers caractères — « AAAA-MM-JJ », dont l'ordre
       alphabétique EST l'ordre chronologique. Le pilote rend une colonne `DATE` sous la forme
       « 2020-03-15T00:00:00.000Z » : tronquer évite de comparer des fuseaux. Une entreprise
       sans date passe en dernier plutôt que de se ranger avant 1970. */
    const cle = (c) => (tri.col === "date_creation" ? String(c.date_creation || "").slice(0, 10) : String(c.name || ""));
    return [...filtrees].sort((a, b) => {
      const va = cle(a); const vb = cle(b);
      if (!va !== !vb) return !va ? 1 : -1;
      return tri.sens * va.localeCompare(vb, "fr");
    });
  }, [rows, query, tri]);

  /* L'en-tête d'une colonne triable EST le bouton de tri : `DataTable` accepte un nœud comme
     intitulé, donc rien à changer dans le composant partagé — et les trente autres tableaux
     ne bougent pas. */
  const enTete = (col, libelle) => (
    <button type="button" className="dt-tri" onClick={() => setTri((t) => ({ col, sens: t.col === col ? -t.sens : 1 }))}
      aria-label={`Trier par ${libelle}`}>
      {libelle}<span aria-hidden="true">{tri.col === col ? (tri.sens > 0 ? " ↑" : " ↓") : " ↕"}</span>
    </button>
  );

  // Même mécanisme que /stagiaires — le MÊME, pas un semblable : la page souffrait du même
  // défaut (469 lignes d'un bloc, 49 écrans) et doit hériter de la même correction.
  const { max, borne, reste, plus } = useListeBornee(shown.length, query);

  return (
    <>
      <PageHead eyebrow="Formation" title="Entreprises"
        lead="Les entreprises clientes de l'organisme. Regroupe des stagiaires sous une même entreprise et inscris-les en une fois."
        actions={
          <>
            <button className="btn ghost" onClick={() => setImporter(true)}><Icon name="upload" size={15} /> Importer</button>
            <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nouvelle entreprise</button>
          </>
        } />

      <StatusMessage status={status} />

      {/* La recherche quitte le coin du titre pour prendre la largeur, comme sur /stagiaires :
          sur quatre cent soixante-neuf entreprises, on vient en retrouver UNE. Deux pages qui
          font le même geste doivent se présenter pareil. */}
      <div className="recherche">
        <label className="rech-champ">
          <Icon name="search" size={18} />
          <input autoFocus aria-label="Rechercher une entreprise"
            placeholder="Rechercher une entreprise, nom, SIRET, ville, référent…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="rech-x" onClick={() => setQuery("")} aria-label="Effacer la recherche">
              <Icon name="x" size={15} />
            </button>
          )}
        </label>
      </div>

      <Card title={<span className="card-ttl"><Icon name="building" size={16} /> {shown.length} entreprise{shown.length > 1 ? "s" : ""}{query ? ` sur ${rows.length}` : ""}</span>}>
        {shown.length === 0 ? (
          <EmptyState icon="building">{rows.length === 0 ? "Aucune entreprise. Crée-en une pour inscrire un groupe de stagiaires." : "Aucune entreprise ne correspond à ta recherche."}</EmptyState>
        ) : (
          <div className="dt-tri-zone">
          {/* SUR TÉLÉPHONE, LE TRI SE CHOISIT ICI. En cartes, `DataTable` retire l'en-tête, et avec
              lui les deux boutons de tri : on ne pouvait plus trier du tout. Ce choix n'apparaît
              qu'à ce moment-là (cf. `.dt-tri-choix`) et pilote le MÊME état `tri` — passer du
              téléphone à l'ordinateur ne change pas l'ordre. */}
          <label className="dt-tri-choix">
            <span>Trier par</span>
            <select className="inp" value={`${tri.col}:${tri.sens}`}
              onChange={(e) => { const [col, sens] = e.target.value.split(":"); setTri({ col, sens: Number(sens) }); }}>
              {/* Courts : sur 375 px, « Date de création, les plus récentes » était coupé. */}
              <option value="name:1">Nom, de A à Z</option>
              <option value="name:-1">Nom, de Z à A</option>
              <option value="date_creation:-1">Création, plus récentes</option>
              <option value="date_creation:1">Création, plus anciennes</option>
            </select>
          </label>
          <DataTable
            rows={shown.slice(0, max)}
            rowKey={(c) => c.id}
            /* La ligne entière ouvre la fiche : `role`/`tabIndex`/Entrée pour que ce soit vrai
               aussi au clavier — une ligne cliquable à la souris seule est une impasse. */
            rowProps={(c) => ({
              style: { cursor: "pointer" },
              role: "link",
              tabIndex: 0,
              "aria-label": `Ouvrir la fiche de ${c.name}`,
              onClick: () => navigate(`/entreprises/${c.id}`),
              onKeyDown: (e) => { if (e.key === "Enter") navigate(`/entreprises/${c.id}`); },
            })}
            cols={[
              { k: "name", t: enTete("name", "Entreprise"), intitule: "Entreprise", principal: true,
                cell: (c) => (
                  <>
                    <b>{c.name}</b>
                    {/* Le référent EST un stagiaire — choisi comme tel (migration 174), ou l'e-mail de
                        l'entreprise est le sien → lien vers sa fiche. `stopPropagation` : sinon le clic
                        déclencherait aussi l'ouverture de la ligne (fiche entreprise). */}
                    {c.learner_id && (
                      <Link to={`/stagiaires/${c.learner_id}`} onClick={(e) => e.stopPropagation()}
                        title={c.referent_stagiaire
                          ? `Référent : ${c.learner_name || "un stagiaire"} — ouvrir sa fiche`
                          : c.learner_name ? `Contact aussi stagiaire : ${c.learner_name} — ouvrir sa fiche` : "Contact aussi stagiaire — ouvrir sa fiche"}
                        aria-label={c.learner_name ? `Ouvrir la fiche stagiaire de ${c.learner_name}` : "Ouvrir la fiche stagiaire liée"}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, marginLeft: 7, borderRadius: 6, border: "1px solid var(--border)", color: "var(--muted)", verticalAlign: "middle" }}>
                        <Icon name="graduation" size={12} />
                      </Link>
                    )}
                    {c.email && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.email}</span>}
                  </>
                ) },
              { k: "siret", t: "SIRET", td: { fontSize: 12 }, cell: (c) => (c.siret ? <span className="mono">{c.siret}</span> : null) },
              { k: "town", t: "Ville", cell: (c) => c.town || null },
              { k: "ref", t: "Référent", cell: (c) => referentAvecCivilite(c) || null },
              { k: "nb", t: "Stagiaires", cell: (c) => <Badge tone={c.learner_count > 0 ? "b" : "n"}>{c.learner_count || 0}</Badge> },
              /* LA DATE DU KBIS (migration 159), triable. Cette colonne a d'abord montré
                 `created_at` — la date d'ENTRÉE DE LA FICHE dans l'application. Ça n'intéresse
                 personne : les quatre cent soixante et onze fiches importées portent toutes la
                 même seconde, et ça ne dit rien des entreprises. Vide tant que la date n'est
                 pas renseignée : on ne devine pas une immatriculation. */
              { k: "date_creation", t: enTete("date_creation", "Date de création"), intitule: "Date de création",
                td: { fontSize: 12, whiteSpace: "nowrap" },
                cell: (c) => dateFr(c.date_creation) || null },
              // Le chevron ne sert qu'au mode TABLEAU : en carte, c'est la carte entière qui
              // s'ouvre, et une flèche seule en pied ressemble à un bouton qui ferait autre
              // chose. `sansCarte` la retire — c'est exactement ce marqueur qui manquait.
              { k: "go", t: "", sansCarte: true, td: { textAlign: "right" }, cell: () => <Icon name="chevron-right" size={16} aria-hidden="true" /> },
            ]}
          />
          {borne && <ListePlus montres={max} total={shown.length} reste={reste} onPlus={plus} />}
          </div>
        )}
      </Card>

      {importer && (
        <ImportCsv type="entreprises" onClose={() => setImporter(false)}
          onImporte={(n) => { load(); setStatus({ type: "success", message: `${n} entreprise${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""}.` }); }} />
      )}
      {creating && <CreateCompanyModal onClose={() => setCreating(false)}
        onCreated={(id, info) => { setCreating(false); navigate(`/entreprises/${id}`, info ? { state: { info } } : undefined); }}
        onError={(m) => setStatus({ type: "error", message: m })} />}
    </>
  );
}

// Même liste que CAPITALES_ENTREPRISE côté serveur (src/api/lib/saisie.js).
const EN_CAPITALES = ["representative_name", "town"];

function CreateCompanyModal({ onClose, onCreated, onError }) {
  const [f, setF] = useState({ name: "", siret: "", vat_number: "", date_creation: "", address: "", zip_code: "", town: "", email: "", phone: "",
    representative_civ: "", representative_name: "", representative_first_name: "", representative_learner_id: "" });
  const [busy, setBusy] = useState(false);
  /* Mêmes conventions que la fiche entreprise et la fiche stagiaire : nom du référent et ville en
     capitales (ils ressortent sur les conventions et les liens de signature), e-mail normalisé —
     c'est l'adresse de la demande de signature. La raison sociale garde SA casse officielle. */
  const set = (k) => (e) => setF((p) => ({
    ...p,
    [k]: EN_CAPITALES.includes(k) ? e.target.value.toLocaleUpperCase("fr")
      : k === "email" ? e.target.value.trim().toLowerCase()
        : e.target.value,
  }));

  async function save() {
    /* Les cinq champs d'une convention. Même règle que le serveur, dite ici : un 422 après coup
       fait perdre la saisie de vue. Le message NOMME ce qui manque — « champs requis » sur neuf
       champs oblige à tous les relire pour trouver lequel. */
    // Le référent se donne par son nom, OU par le stagiaire choisi (le serveur recopie alors ses noms).
    const manquants = [["name", "Nom de l'entreprise"], ["siret", "SIRET"], ["email", "E-mail"],
      ["phone", "Téléphone"], ["representative_name", "Nom du référent"]]
      .filter(([k]) => !(k === "representative_name" && f.representative_learner_id) && !String(f[k] || "").trim()).map(([, l]) => l);
    if (manquants.length) { onError(`Champ${manquants.length > 1 ? "s" : ""} requis : ${manquants.join(", ")}.`); return; }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) { onError("Adresse e-mail invalide."); return; }
    setBusy(true);
    try {
      const r = await createCompany(f);
      const perdu = messageReferentPerdu(r?.ignores);
      onCreated(r.data?.id, perdu ? `Entreprise créée, sauf ${perdu}` : null);
    }
    catch (e) { onError(e.message); setBusy(false); }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="mhead"><h3>Nouvelle entreprise</h3><button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button></div>
        <div className="mbody">
          <div className="field"><label>Nom de l'entreprise<Requis /></label><input className="inp" value={f.name} onChange={set("name")} placeholder="SARL Le Petit Four" autoFocus /></div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label>SIRET<Requis /></label><input className="inp" value={f.siret} onChange={set("siret")} placeholder="879 955 136 00012" /></div>
            <div className="field"><label>Téléphone<Requis /></label><input className="inp" value={f.phone} onChange={set("phone")} placeholder="05 62 98 12 34" /></div>
          </div>
          <div className="row2">
            {/* La date du KBIS (migration 159) — saisissable dès la création, à côté du SIRET
                qu'on recopie du même extrait. Facultative : l'école ne la connaît pas toujours,
                et une date inventée vaut moins que pas de date. */}
            <div className="field"><label>Date de création</label><input className="inp" type="date" value={f.date_creation} onChange={set("date_creation")} /></div>
          </div>
          {/* LE N° DE TVA MANQUAIT ICI, alors que la colonne existe (migration 123) et que la
              FICHE le propose déjà : on pouvait donc le saisir après coup, jamais à la création.
              Résultat mesuré : quatre cent soixante-neuf entreprises, aucune avec un numéro.
              Facultatif — toutes n'en ont pas — mais le contrôle de format s'applique dès qu'il
              est saisi, ici comme au serveur, qui reste seul juge. */}
          <div className="field">
            <label>N° TVA intracommunautaire</label>
            <input className="inp" value={f.vat_number} onChange={set("vat_number")}
              placeholder="FR76123456789" maxLength={16} />
            <p className="hint" style={{ margin: "4px 0 0", fontSize: 12 }}>
              Treize caractères : « FR » suivi de onze chiffres, ou treize chiffres. Laissez vide si l'entreprise n'en a pas.
            </p>
          </div>
          <div className="field"><label>Adresse</label><input className="inp" value={f.address} onChange={set("address")} placeholder="12 rue des Lilas" /></div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label>Code postal</label><input className="inp" value={f.zip_code} onChange={set("zip_code")} placeholder="65300" /></div>
            <div className="field"><label>Ville</label><input className="inp" value={f.town} onChange={set("town")} placeholder="LANNEMEZAN" /></div>
          </div>
          <div className="field"><label>E-mail<Requis /></label><input className="inp" type="email" value={f.email} onChange={set("email")} placeholder="contact@lepetitfour.fr" /></div>
          <ReferentEntreprise valeur={f} onChange={(m) => setF((p) => ({ ...p, ...m }))} requis />
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={busy}><Icon name="check" size={15} /> Créer</button>
        </div>
      </div>
    </div>
  );
}
