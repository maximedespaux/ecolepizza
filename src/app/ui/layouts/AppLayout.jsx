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
  const [paletteChargee, setPaletteChargee] = useState(false);
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

  /* LE TIROIR SE REFERME QUAND ON NAVIGUE. Sur téléphone et tablette, la barre latérale est un
     tiroir posé PAR-DESSUS la page : cliquer une rubrique naviguait bien, mais laissait le
     tiroir ouvert sur la page qu'on venait de demander — il fallait un second geste, sur le
     voile, pour découvrir le résultat. Le premier clic ne montrait rien.

     Ici plutôt que sur chaque lien : ça couvre TOUTES les navigations d'un coup — les rubriques,
     l'entrée « Paramètres » du menu profil (qui appelle `navigate`), et tout lien ajouté demain.
     Sur un écran large le tiroir n'existe pas et `open` vaut déjà faux : sans effet.

     Ne couvre PAS le clic sur la rubrique où l'on est déjà (le chemin ne change pas, l'effet ne
     se déclenche pas) — d'où le `onClose` porté aussi par les liens eux-mêmes, cf. Sidebar. */
  useEffect(() => { setOpen(false); }, [location.pathname]);

  /* LES COULEURS DE FORMATION SONT CHARGÉES AVANT LE PREMIER RENDU, et c'est tout l'objet de
     `paletteChargee`.
     LE DÉFAUT, signalé depuis un téléphone le 2026-09-16 : « au chargement, la couleur du badge
     ne correspond pas aux données, mais se corrige dès qu'on clique ». Mesuré — NIV1H vaut
     #00b2b2 (cyan) dans les réglages de l'école, et #1e3a8a (bleu marine) dans la palette de
     repli du code. Le badge s'affichait donc marine, puis devenait cyan.
     POURQUOI ÇA NE SE CORRIGEAIT PAS TOUT SEUL. `setBadgeColors` écrit dans une table de module,
     que personne n'observe : aucun composant n'est abonné. Le `bumpColors` qui vivait ici
     re-rendait bien CE layout — mais `<Outlet />` rend un élément dont React Router garde
     l'identité d'un rendu à l'autre, et React saute alors tout le sous-arbre. La page ne se
     re-rendait donc jamais, jusqu'au premier clic qui la faisait se re-rendre pour une autre
     raison. Sur un téléphone, où le réseau est plus lent, la page paraît TOUJOURS avant les
     couleurs : le défaut y est systématique.
     PLUTÔT QUE D'ABONNER TOUTE L'APPLICATION à une table mutable, on attend. La requête part en
     PARALLÈLE du contrôle de session déjà en cours : elle n'ajoute du délai que si elle est la
     plus lente des deux. Et elle ne peut pas retenir l'application — échec ou lenteur, on
     continue au bout de deux secondes et demie, avec la palette par défaut. */
  useEffect(() => {
    if (!isConnected) { setPaletteChargee(true); return undefined; } // rien à charger : on n'attend pas
    let vivant = true;
    const fini = () => { if (vivant) setPaletteChargee(true); };
    const filet = setTimeout(fini, 2500);
    getFormations()
      .then((r) => {
        const map = {};
        for (const f of r.data || []) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
        if (Object.keys(map).length) setBadgeColors(map);
      })
      .catch(() => {})
      .finally(() => { clearTimeout(filet); fini(); });
    return () => { vivant = false; clearTimeout(filet); };
  }, [isConnected]);

  /* La palette entre dans l'écran d'attente qui existait déjà : une page ne paraît jamais avec
     des couleurs qu'elle devra corriger. */
  if (isLoading || !paletteChargee) {
    return (
      <div className="app-loading">
        <div className="brand-splash">
          <img src={LOGO} alt="" />
          <span>Impastio</span>
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
      <Sidebar open={open} onClose={() => setOpen(false)} />
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
