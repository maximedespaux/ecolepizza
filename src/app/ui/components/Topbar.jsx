import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { PAGE_TITLES } from "../lib/nav.js";
import { getNotifications, msDepuisMutationLocale } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { subscribeRealtime } from "../lib/realtime.js";
import { playNotif, isNotifMuted, setNotifMuted } from "../lib/notifSound.js";
import { Icon } from "./Icon.jsx";
import { compteurPastille } from "../lib/format.js";
import ThemeToggle from "./ThemeToggle.jsx";
import SpaceSwitcher from "./SpaceSwitcher.jsx";
import MemoBouton from "./MemoBouton.jsx";

/** Barre supérieure : fil d'Ariane, mémos, notifications, thème, déconnexion. */
function Topbar({ onMenu }) {
  const { logout } = useContext(UserContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = PAGE_TITLES[pathname] || "";
  /* DEUX COMPTES, DEUX COULEURS — comme le bouton des mémos juste à côté. Le ROUGE dit ce qui
     appelle un geste (les alertes), le BLEU ce qui s'est passé dans l'équipe. Un seul nombre
     mêlait les deux : on voyait « 12 » et on ouvrait pour découvrir douze lignes de journal,
     alors que la seule chose qui attendait vraiment était une commande boutique. */
  const [alertes, setAlertes] = useState(0);
  const [activite, setActivite] = useState(0);
  const [muted, setMuted] = useState(isNotifMuted());
  const [ringing, setRinging] = useState(false);
  const prevAlertes = useRef(null); // null = premier chargement (pas de son)

  /* LE SON NE SUIT QUE LES ALERTES — décision du 2026-09-17.

     CE QUI SE PASSAIT. Deux déclencheurs faisaient sonner cette barre :
       · le signal temps réel, émis après CHAQUE écriture réussie de n'importe qui dans
         l'organisme — un stagiaire qui signe, qui répond à un QCM, qui marque une notification
         lue. Mesuré sur le journal le 16/09 : soixante-sept actions, dont dix-neuf entre 16 h et
         17 h, et c'est un plancher, les écritures non journalisées sonnant aussi ;
       · la hausse du compteur de la cloche — qui inclut les lignes d'ACTIVITÉ des collègues.
     L'école entendait des sons « sans savoir d'où ils viennent », et c'était STRUCTUREL : depuis
     le pentest d'août, le signal temps réel est volontairement VIDE (il faisait fuiter la trace
     des actions du personnel vers les stagiaires). Un son sur ce signal ne pouvait donc JAMAIS
     dire ce qui s'était passé, et rien ne s'affichait nulle part au même instant.

     LA RÈGLE, alignée sur les onglets de la page Notifications : une ALERTE appelle un geste —
     émargement à signer, commande boutique, document signé — elle sonne, et la cloche se secoue
     au même instant : chaque son correspond à quelque chose de visible. L'ACTIVITÉ est une
     information : elle s'affiche, elle ne sonne plus.

     On sonne donc sur le compte des ALERTES non lues, jamais sur le total. Les pastilles, elles,
     disent les deux — chacune la sienne, rouge pour ce qui attend, bleue pour ce qui s'est
     passé : elles disent « il y a des choses à lire », le son dit « quelque chose vous
     attend ». */
  const loadNotifs = () =>
    getNotifications()
      .then((r) => {
        /* LE COMPTE VIENT DU SERVEUR (`non_lues`), pas de la longueur des listes : elles sont
           coupées à 40 et 30 lignes, et la pastille plafonnait donc là sans le dire. Le repli
           sur les listes garde l'écran juste face à un serveur pas encore déployé. */
        const n = r.non_lues || {};
        const alertes = n.alertes !== undefined ? n.alertes : (r.data || []).filter((x) => !x.is_read).length;
        setAlertes(alertes);
        setActivite(n.activite !== undefined ? n.activite : (r.activite || []).filter((x) => !x.is_read).length);
        /* LA GARDE ANTI-ÉCHO RESTE, pour les alertes que je provoque moi-même : signer à la place
           d'un stagiaire crée « Document signé » pour tout l'organisme. Le repère est posé par
           apiClient, partagé entre les onglets du navigateur. Les relances d'émargement, elles,
           ne sont l'écho d'aucun geste : elles partent de l'horloge, et sonnent. */
        if (prevAlertes.current !== null && alertes > prevAlertes.current && msDepuisMutationLocale() > 2500) {
          playNotif();
          setRinging(true);
          setTimeout(() => setRinging(false), 820);
        }
        prevAlertes.current = alertes;
      })
      .catch(() => {});

  useEffect(() => { loadNotifs(); }, [pathname]);
  /* Rafraîchit le compteur : sur le signal temps réel, toutes les 25 s, et au retour sur
     l'onglet — MAIS seulement si l'onglet est visible (cf. useAutoRefresh). */
  useAutoRefresh(loadNotifs, { interval: 25000 });

  /* UN ONGLET EN ARRIÈRE-PLAN DOIT POUVOIR SONNER, et c'est justement là qu'une alerte sert :
     quand on travaille ailleurs. Or `useAutoRefresh` s'arrête dès que l'onglet est masqué. On
     recharge donc sur le signal temps réel MÊME masqué — et SEULEMENT masqué, le cas visible
     étant déjà couvert, pour ne pas interroger deux fois. Ce n'est plus l'ancien son d'activité :
     on ne joue rien ici, on relit le compteur, et seul un compteur d'ALERTES en hausse sonne. */
  useEffect(() => subscribeRealtime(() => {
    if (document.visibilityState === "hidden") loadNotifs();
  }), []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setNotifMuted(next);
    if (!next) playNotif(); // aperçu sonore à la réactivation
  };

  return (
    <header className="topbar">
      <button className="menu-btn icon-btn" onClick={onMenu} aria-label="Ouvrir le menu">
        <Icon name="menu" size={20} />
      </button>
      {/* La marque est dans SA propre balise pour pouvoir céder la place sur un écran étroit :
          « Impastio / » est constant, il n'apprend rien, et il coûtait les quelque quatre-vingts
          pixels qui poussaient les commandes hors de l'écran. Le titre, lui, reste. */}
      <div className="crumbs">
        <span className="crumbs-marque">Impastio <span style={{ opacity: 0.4 }}>/</span> </span>
        <b>{title}</b>
      </div>
      <div className="spacer" />
      <SpaceSwitcher />

      <button
        className="icon-btn"
        onClick={toggleMute}
        title={muted ? "Activer le son des alertes" : "Couper le son des alertes"}
        aria-label={muted ? "Activer le son des alertes" : "Couper le son des alertes"}
        aria-pressed={muted}
      >
        <Icon name={muted ? "volume-off" : "volume"} size={17} />
      </button>

      {/* LE MÉMO À CÔTÉ DE LA CLOCHE : les deux disent « ce qui t'attend ». La cloche porte ce que
          l'application a remarqué, le mémo ce qu'on s'est noté soi-même. */}
      <MemoBouton />

      <button
        className={"icon-btn bell" + (ringing ? " ring" : "")}
        style={{ position: "relative" }}
        onClick={() => navigate("/notifications")}
        title="Notifications"
        aria-label={alertes + activite > 0
          ? `Notifications : ${alertes} alerte${alertes > 1 ? "s" : ""} et ${activite} ligne${activite > 1 ? "s" : ""} d'activité non lues`
          : "Notifications"}
      >
        <Icon name="bell" size={18} />
        {/* LE ROUGE EN HAUT À DROITE, LE BLEU EN HAUT À GAUCHE : exactement la disposition du
            bouton des mémos, pour que les deux couleurs veuillent dire la même chose partout. */}
        {alertes > 0 && <span className="notif-dot">{compteurPastille(alertes)}</span>}
        {activite > 0 && <span className="notif-dot ton-equipe">{compteurPastille(activite)}</span>}
      </button>

      <ThemeToggle />
      <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion">
        <Icon name="power" size={18} />
      </button>
    </header>
  );
}

export default Topbar;
