import { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { modeForPath } from "../lib/nav.js";
import { useMoneyMask, canRevealMoney } from "../lib/moneyPrivacy.js";
import { getFormations } from "../api/apiClient.js";
import { setBadgeColors } from "../lib/levels.js";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";

/**
 * Contrôles bloqués en LECTURE SEULE.
 *
 * L'autorité reste le SERVEUR (middleware `enforceSectionMode`) : ceci n'est que l'interface.
 * Mais l'interface mentait — la liste ne couvrait que `.btn.primary`, `.btn.danger`, `.danger`
 * et `[type=submit]`, alors que la convention de bouton destructeur la plus répandue de
 * l'application est `iconbtn del`, employée dans DIX-NEUF pages. Ces corbeilles-là passaient
 * donc au travers : on cliquait, la requête partait, et c'est le serveur qui refusait — avec
 * un message d'erreur, là où l'écran annonçait « lecture seule » en haut de page.
 *
 * Autrement dit, la protection dépendait de la classe CSS que chaque page avait choisie.
 *
 * `[data-lecture-ok]` laisse une échappatoire explicite : certains boutons primaires ne
 * modifient rien (exporter, imprimer, replier un panneau) et doivent continuer de répondre.
 * Une exception DÉCLARÉE vaut mieux qu'un oubli silencieux.
 */
const CONTROLES_MODIFIANTS = ".btn.primary, .btn.danger, .danger, .iconbtn.del, .icon-btn.danger, [type=submit]";

function blockMutations(e) {
  const el = e.target.closest?.(CONTROLES_MODIFIANTS);
  if (el && !el.closest("[data-lecture-ok]")) { e.preventDefault(); e.stopPropagation(); }
}

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Coquille des pages authentifiées : barre latérale + barre supérieure + contenu.
 * Redirige vers /login si l'utilisateur n'est pas connecté.
 */
function AppLayout() {
  const { user, isConnected, isLoading } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [, bumpColors] = useState(0);
  const location = useLocation();
  const readOnly = user ? modeForPath(user, location.pathname) === "read" : false;

  // Mode confidentiel partagé : masque les montants sur les pages Ventes & Finance
  // (+ Partenaires). Toujours masqué pour les profils sans droit de révélation (formateur).
  const { masked: moneyMasked } = useMoneyMask();
  /* LE TABLEAU DE BORD EN FAIT PARTIE, et c'est même la page qui compte le plus. Il affiche le
     chiffre d'affaires — le même que `/ventes`, qui le masque — et c'est la page d'arrivée après
     connexion : celle qui reste ouverte quand quelqu'un passe derrière l'écran. Le masque servait
     à couvrir « un écran de caisse ou de comptabilité ouvert devant un stagiaire » ; il laissait
     à découvert l'écran le plus souvent ouvert de tous. */
  const FINANCE = ["/ventes", "/inventaire", "/factures", "/comptabilite", "/partenaires", "/dashboard"];
  const moneyMask = FINANCE.some((p) => location.pathname.startsWith(p)) && (!canRevealMoney(user) || moneyMasked);

  // Charge une fois les couleurs personnalisées des formations pour que les
  // badges (formation / stagiaire / session) soient cohérents partout.
  useEffect(() => {
    if (!isConnected) return;
    getFormations().then((r) => {
      const map = {};
      for (const f of r.data || []) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      if (Object.keys(map).length) { setBadgeColors(map); bumpColors((v) => v + 1); }
    }).catch(() => {});
  }, [isConnected]);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash">
          <img src={LOGO} alt="" />
          <span>Impasto</span>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    /* `adm-app` porte l'identité de l'espace d'administration — police de titrage, coins,
       retour à l'appui. Exactement le pendant de `.stu-app` côté stagiaire : on redéfinit les
       tokens, on ne réécrit aucun composant. */
    <div className="app adm-app">
      <Sidebar open={open} />
      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setOpen(true)} />
        <main className={"content" + (moneyMask ? " money-mask" : "")}>
          {readOnly && (
            <div style={{
              margin: "0 0 14px", padding: "8px 12px", borderRadius: 8,
              background: "rgba(230,160,30,.12)", border: "1px solid rgba(230,160,30,.35)",
              color: "var(--muted)", fontSize: 13, display: "flex", gap: 8, alignItems: "center",
            }}>
              Lecture seule, vous pouvez consulter cette rubrique mais pas la modifier.
            </div>
          )}
          {/* `lecture-seule` habille ce que `blockMutations` intercepte : sans elle, un bouton
              gardait son air cliquable et ne faisait rien — un clic sans effet et sans
              explication est plus déroutant qu'un bouton visiblement éteint. Les deux
              lisent la MÊME liste de sélecteurs, dans le JS et dans la CSS. */}
          <div
            className={readOnly ? "lecture-seule" : undefined}
            onClickCapture={readOnly ? blockMutations : undefined}
            onSubmitCapture={readOnly ? ((e) => { e.preventDefault(); e.stopPropagation(); }) : undefined}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
