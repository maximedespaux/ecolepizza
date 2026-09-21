import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getARecontacter, updateStagiaire } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import { bumpBadges } from "../lib/events.js";
import { initials } from "../lib/format.js";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";

/**
 * « À RECONTACTER » : LA LISTE DE PRIORITÉ (migration 169, demandée le 2026-09-21).
 *
 * Les fiches cochées « à recontacter », la plus ancienne attente en tête (c'est le serveur qui
 * trie), avec de quoi rappeler tout de suite : le téléphone cliquable, le canal du premier contact,
 * depuis quand on attend, la note. La MÊME carte en tête de la page des stagiaires et sur le
 * tableau de bord — une seule définition, pour que les deux ne divergent pas.
 *
 * « Rappelé » décoche la case d'un clic (PATCH /stagiaires/:id), et la pastille du menu suit
 * aussitôt. Le bouton n'apparaît qu'à qui peut ÉCRIRE sur les stagiaires — la règle même du serveur
 * (`peutEcrire`) ; un bouton que l'API refuserait mentirait.
 *
 * Rien à rappeler, ou pas le droit de le savoir (la route est celle du bureau) : la carte ne
 * s'affiche pas. Une liste vide n'est pas une information à montrer ici.
 *
 * `refresh` : change pour recharger (après l'enregistrement d'une fiche). `onCharge(liste)` : la
 * liste reçue, pour qu'une page marque ces fiches ailleurs (ou sache qu'il y en a). `limite` : au
 * plus tant de lignes, avec un lien « voir tout ».
 */
function attente(depuis) {
  if (!depuis) return null;
  const t = new Date(String(depuis).replace(" ", "T")).getTime();
  if (!Number.isFinite(t)) return null;
  const jours = Math.floor((Date.now() - t) / 864e5);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "depuis hier";
  return `depuis ${jours} jours`;
}

function ARecontacter({ refresh, onCharge, limite, className = "", style }) {
  const { user } = useContext(UserContext) || {};
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null); // id de la fiche en train d'être décochée
  const peutAgir = peutEcrire(user, "/stagiaires");

  function charger() {
    return getARecontacter()
      .then((r) => { const l = r.data || []; setListe(l); onCharge?.(l); })
      // 403 (pas le bureau) ou panne : rien à afficher — la page reste utilisable sans cette carte.
      .catch(() => { setListe(null); onCharge?.([]); });
  }
  useEffect(() => { charger(); }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rappele(l) {
    setEnCours(l.id);
    try {
      await updateStagiaire(l.id, { a_recontacter: false });
      setErreur(null);
      await charger();
      bumpBadges();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(null);
    }
  }

  if (!liste || liste.length === 0) return null;
  const montres = limite ? liste.slice(0, limite) : liste;
  const reste = liste.length - montres.length;

  return (
    <Card className={`rappels ${className}`} style={style}
      title={<span className="card-ttl"><Icon name="phone" size={16} /> À recontacter <b className="chiffres rappels-n">{liste.length}</b></span>}
      more={reste > 0 ? <Link to="/stagiaires" className="card-more">Voir les {liste.length} <Icon name="chevron-right" size={13} aria-hidden="true" /></Link> : null}>
      {erreur && <p className="hint" role="alert" style={{ color: "var(--ember1)", marginTop: 0 }}>{erreur}</p>}
      <ul className="rappels-l">
        {montres.map((l) => (
          <li key={l.id} className="rappel">
            <Link to={`/stagiaires/${l.id}`} className="rappel-qui" title="Ouvrir la fiche">
              <span className="avatar">{initials(l.first_name, l.last_name)}</span>
              <span className="rappel-nom">
                <b>{[l.last_name, l.first_name].filter(Boolean).join(" ")}</b>
                <span>{[l.contacted_by && `par ${l.contacted_by}`, attente(l.a_recontacter_depuis)].filter(Boolean).join(" · ") || "à rappeler"}</span>
              </span>
            </Link>
            {l.note_libre && <span className="rappel-note" title={l.note_libre}>{l.note_libre}</span>}
            <span className="rappel-gestes">
              {l.phone && (
                <a className="btn sm" href={`tel:${String(l.phone).replace(/[^\d+]/g, "")}`} title={`Appeler ${l.phone}`}>
                  <Icon name="phone" size={14} /> {l.phone}
                </a>
              )}
              {!l.phone && l.email && (
                <a className="btn sm" href={`mailto:${l.email}`} title={`Écrire à ${l.email}`}>
                  <Icon name="mail" size={14} /> E-mail
                </a>
              )}
              {peutAgir && (
                /* Bouton SECONDAIRE : une liste de huit rappels portait huit boutons pleins de la
                   couleur d'action, et la carte criait. Le geste reste à portée, sans hurler. */
                <button type="button" className="btn sm" disabled={enCours === l.id} onClick={() => rappele(l)}
                  title="La personne a été recontactée : la retirer de la liste">
                  <Icon name="check" size={14} /> Rappelé
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default ARecontacter;
