import { useContext, useState } from "react";
import { createPortal } from "react-dom";
import { UserContext } from "../context/UserContext.jsx";
import { Icon } from "./Icon.jsx";
import { initials } from "../lib/format.js";
import { AVATARS, parseAvatar, getAvatar, setAvatar } from "../lib/gamification.js";
import { CADRES_PERSONNEL, getCadreChoisi, setCadreChoisi } from "../lib/cadres.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * Personnalisation du compte — côté ORGANISME.
 *
 * POURQUOI ELLE EXISTE. Depuis que l'école entre dans la Communauté par son propre menu et y
 * publie des annonces, ses publications s'affichaient avec un rond gris et des initiales :
 * un membre du bureau n'a pas de fiche `learner`, donc pas d'avatar. Sur un fil où chacun se
 * reconnaît à sa pizza, l'école était la seule silhouette anonyme — et c'est elle qui parle.
 *
 * CE QU'ELLE NE REPREND PAS du profil stagiaire : la progression. Pas de barre, pas de paliers,
 * pas de « formations terminées » — ces notions n'ont pas de sens pour un secrétariat. Le cadre
 * proposé est donc le seul cadre de PERSONNEL, et jamais les cadres de parcours : ceux-là
 * annoncent publiquement un nombre de formations terminées (cf. lib/cadres.js). Le serveur
 * refuse le croisement dans les deux sens, l'écran n'est pas la seule garde.
 *
 * Écritures : `setAvatar` / `setCadreChoisi` sont les MÊMES fonctions que côté stagiaire. Elles
 * écrivent en localStorage (lecture synchrone, affichage immédiat) et poussent vers l'API en
 * best-effort ; côté serveur, la route se rabat sur `user` quand il n'y a pas de fiche
 * stagiaire (migration 126). Rien à dupliquer, donc rien à tenir d'accord.
 */
const PALETTE = ["#dc3e37", "#ff6900", "#fcb900", "#2f9e6f", "#3aa0e0", "#2c3371", "#7b3f9e", "#8a5a2b", "#e0533e", "#111827"];

export default function ProfilPersonnel({ onClose }) {
  useEchap(onClose);
  const { user } = useContext(UserContext);
  const uid = user?.id;
  // La base fait foi (elle suit d'un appareil à l'autre) ; le navigateur prend le relais tant
  // que la migration 126 n'est pas jouée — sans quoi l'écran resterait vide sans rien dire.
  const [avatar, setAv] = useState(() => parseAvatar(user?.avatar) || getAvatar(uid));
  const [choisi, setChoisi] = useState(() => user?.cadre || getCadreChoisi(uid));

  function choose(a) { const c = avatar?.color; setAvatar(uid, a.id, c); setAv({ ...a, color: c || a.color }); }
  function chooseColor(c) { const base = avatar || AVATARS[0]; setAvatar(uid, base.id, c); setAv({ ...base, color: c }); }
  function choisirCadre(id) { setCadreChoisi(uid, id); setChoisi(id); }

  const who = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Mon compte";
  const cadreId = choisi && choisi !== "aucun" ? choisi : null;

  /* La barre latérale est `position:sticky; z-index:40` : elle crée un contexte
     d'empilement, dans lequel le `z-index:100` de l'overlay reste ENFERMÉ — le contenu
     principal passait devant, et la modale apparaissait comme un simple voile gris.
     `createPortal` la sort au niveau du body, seul endroit où son z-index compte. */
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 470 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Personnalisation</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <span className={"pf-avatar " + (cadreId ? `cadre cadre-${cadreId}` : "")}
              style={{ background: avatar ? avatar.color : "var(--navy)", flex: "none" }}>
              {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Votre cadre</div>
          <p className="hint" style={{ margin: 0 }}>
            Les cadres Bronze → Maestro récompensent des formations terminées : ils restent aux
            stagiaires. Celui-ci dit simplement que vous faites partie de l'organisme.
          </p>
          <div className="pf-cadres" style={{ marginBottom: 18 }}>
            {CADRES_PERSONNEL.map((c) => (
              <button key={c.id} type="button" className={"pf-cadre" + (choisi === c.id || (!choisi && c.id === "aucun") ? " on" : "")}
                onClick={() => choisirCadre(c.id)} title={c.desc || c.nom}>
                <span className={"pf-cadre-apercu " + (c.id !== "aucun" ? `cadre cadre-${c.id}` : "")}>
                  <span aria-hidden="true">{avatar ? avatar.emoji : "🍕"}</span>
                </span>
                <span className="pf-cadre-nom">{c.nom}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Votre avatar</span>
            <button className="btn sm ghost" onClick={() => choose(AVATARS[Math.floor(Math.random() * AVATARS.length)])} title="Avatar au hasard">🎲 Surprise</button>
          </div>
          <div className="pf-picker">
            {AVATARS.map((a) => (
              <button key={a.id} className={"pf-opt" + (avatar?.id === a.id ? " sel" : "")}
                style={{ background: avatar?.id === a.id ? (avatar.color || a.color) : a.color }}
                onClick={() => choose(a)} title={a.id} aria-label={`Avatar ${a.id}`}>
                {a.emoji}
                {avatar?.id === a.id && <span className="pf-check"><Icon name="check" size={12} /></span>}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 8px" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Couleur du fond</span>
            <label className="btn sm ghost" style={{ cursor: "pointer" }} title="Couleur personnalisée">
              🎨 Personnalisée
              <input type="color" value={avatar?.color || "#dc3e37"} onChange={(e) => chooseColor(e.target.value)}
                style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
            </label>
          </div>
          <div className="pf-colors">
            {PALETTE.map((c) => (
              <button key={c} className={"pf-color" + (avatar?.color?.toLowerCase() === c.toLowerCase() ? " sel" : "")}
                style={{ background: c }} onClick={() => chooseColor(c)} title={c} aria-label={`Fond ${c}`}>
                {avatar?.color?.toLowerCase() === c.toLowerCase() && <Icon name="check" size={12} />}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
            Votre avatar et votre cadre vous représentent dans la Communauté — y compris sur les
            annonces publiées au nom de l'école.
          </p>
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
    ,
    document.body
  );
}
