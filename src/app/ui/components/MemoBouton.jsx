import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserContext } from "../context/UserContext.jsx";
import { getMemosCompte, marquerMemosVus } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { onMemosChange } from "../lib/events.js";
import { ROLES_MEMO } from "../lib/memos.js";
import { Icon } from "./Icon.jsx";
import MemoListe from "./MemoListe.jsx";

/**
 * LE MÉMO DANS LA BARRE DU HAUT, à côté de la cloche (demandé le 2026-09-22).
 *
 * LE CHIFFRE EST CELUI QUI APPELLE UN GESTE : les mémos échus ou dus AUJOURD'HUI, pas le nombre de
 * lignes de la liste. Un compteur qui ne descend jamais cesse d'être lu — c'est la règle déjà suivie
 * par la cloche, où une alerte appelle une action.
 *
 * ET UNE SECONDE PASTILLE, D'UNE AUTRE COULEUR, POUR CE QU'ON VIENT DE ME CONFIER : les mémos où un
 * collègue m'a mentionné et que je n'ai pas encore ouverts (migration 177). Deux chiffres parce que
 * ce sont deux choses — « ce qui est dû » ne se confond pas avec « ce qui est nouveau », et les
 * additionner donnerait un nombre qui ne veut rien dire. Ouvrir le panneau éteint la seconde : c'est
 * le geste qui vaut lecture, pas le sondage qui tourne en fond.
 *
 * ET LE SERVEUR N'EST PRÉVENU QU'À LA FERMETURE. Le marquer à l'ouverture effaçait « Nouveau pour
 * vous » de la liste au moment même où elle s'affichait : la personne ouvrait pour voir ce qu'on
 * venait de lui confier, et ne voyait plus lequel c'était. La pastille s'éteint donc tout de suite à
 * l'écran, et la lecture ne se grave qu'en refermant.
 *
 * LE PANNEAU PASSE PAR UN PORTAIL. La barre porte un `backdrop-filter`, et un descendant en
 * `position: fixed` s'y accroche au lieu de l'écran (même piège que la fenêtre de signature, cf.
 * SignatureModal). Rendu dans `document.body`, il se place d'après le bouton — et en pleine largeur
 * sous 560 px, où un panneau de 380 px déborderait.
 *
 * IL NE SE FERME PAS AU DÉFILEMENT, à la différence des menus d'action : on y écrit, et la liste
 * défile à l'intérieur. Un clic à l'extérieur ou Échap le ferment.
 */
const LARGE = 560;

export default function MemoBouton() {
  const { user } = useContext(UserContext);
  const autorise = ROLES_MEMO.includes(user?.role);
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState(null);
  const [echus, setEchus] = useState(0);
  const [nouveaux, setNouveaux] = useState(0);
  const refBouton = useRef(null);
  const refPanneau = useRef(null);
  const aMarquer = useRef(false);

  const compter = () => getMemosCompte()
    .then((r) => { setEchus(Number(r?.data?.echus) || 0); setNouveaux(Number(r?.data?.nouveaux) || 0); })
    .catch(() => { /* silencieux : un compteur ne doit pas casser la barre */ });
  useEffect(() => { if (autorise) compter(); }, [autorise]);
  useEffect(() => (autorise ? onMemosChange(compter) : undefined), [autorise]);
  useAutoRefresh(compter, { interval: 60000, enabled: autorise });

  /* Parti sans refermer (on quitte la page, le panneau ouvert) : la lecture se grave quand même. */
  useEffect(() => () => { if (aMarquer.current) marquerMemosVus().catch(() => {}); }, []);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => {
      if (refBouton.current?.contains(e.target)) return;
      if (refPanneau.current?.contains(e.target)) return;
      fermer();
    };
    const clavier = (e) => { if (e.key === "Escape") fermer(); };
    const replacer = () => setPos(placer(refBouton.current));
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    window.addEventListener("resize", replacer);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
      window.removeEventListener("resize", replacer);
    };
    /* `fermer` est recréé à chaque rendu et ne garde aucun état : le réinscrire à chaque fois
       rebrancherait les trois écouteurs pour rien. L'effet ne dépend que de l'ouverture. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  /* OUVRIR VAUT LECTURE : la pastille s'éteint à l'écran, et la note en est prise pour la fermeture. */
  const ouvrir = () => { if (nouveaux > 0) { setNouveaux(0); aMarquer.current = true; } };
  const fermer = () => {
    setOuvert(false);
    if (!aMarquer.current) return;
    aMarquer.current = false;
    marquerMemosVus().catch(() => { /* sans la 177, il n'y a rien à marquer */ }).then(compter);
  };

  if (!autorise) return null;

  return (
    <>
      <button
        ref={refBouton}
        className="icon-btn"
        style={{ position: "relative" }}
        onClick={() => { if (ouvert) { fermer(); return; } setPos(placer(refBouton.current)); setOuvert(true); ouvrir(); }}
        title="Mémo"
        aria-label={etiquette(echus, nouveaux)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
      >
        <Icon name="list-checks" size={18} />
        {echus > 0 && <span className="notif-dot">{echus > 9 ? "9+" : echus}</span>}
        {nouveaux > 0 && <span className="memo-dot-neuf">{nouveaux > 9 ? "9+" : nouveaux}</span>}
      </button>

      {ouvert && pos && createPortal(
        <div ref={refPanneau} className="memo-panneau" role="dialog" aria-label="Mémo" style={pos}>
          <div className="memo-panneau-tete">
            <b><Icon name="list-checks" size={15} aria-hidden="true" /> Mémo</b>
            <button className="x" onClick={fermer} aria-label="Fermer"><Icon name="x" size={15} /></button>
          </div>
          <div className="memo-panneau-corps"><MemoListe autoFocus onNaviguer={fermer} /></div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* Sous le bouton, aligné à droite sur lui. En pleine largeur sur un écran étroit. */
/* Deux nombres, deux phrases : un lecteur d'écran doit entendre ce que chaque pastille compte. */
function etiquette(echus, nouveaux) {
  const bouts = [];
  if (nouveaux > 0) bouts.push(nouveaux > 1 ? `${nouveaux} nouveaux pour vous` : "1 nouveau pour vous");
  if (echus > 0) bouts.push(`${echus} à faire aujourd'hui ou en retard`);
  return bouts.length ? `Mémo (${bouts.join(", ")})` : "Mémo";
}

function placer(bouton) {
  const r = bouton?.getBoundingClientRect();
  if (!r) return null;
  const haut = Math.round(r.bottom + 8);
  if (window.innerWidth <= LARGE) return { top: haut, left: 8, right: 8 };
  return { top: haut, right: Math.max(8, Math.round(window.innerWidth - r.right)) };
}
