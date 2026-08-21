import { useContext, useEffect, useRef, useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import ConsentModal from "../components/ConsentModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { initials } from "../lib/format.js";
import { getMyAccess } from "../api/apiClient.js";
import { getAvatar, AVATAR_EVENT, COMMUNITY_EVENT, hydrateProfile } from "../lib/gamification.js";
import AvatarCadre from "../components/AvatarCadre.jsx";
import { cadrePorteDe, cadreValeur, useCadreChoisi } from "../lib/cadres.js";

const navClass = ({ isActive }) => `btn sm ${isActive ? "primary" : "ghost"}`;

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

// Sections débloquées seulement après avoir franchi le point d'accès (breakpoint) d'une formation.
const GATED_PATHS = ["/pizza-quest", "/empatements", "/garnitures", "/realisations", "/communaute", "/notions"];

const LOCK_TITLE = "Signez vos documents jusqu'au point d'accès pour débloquer";

/**
 * Les outils : ce que le stagiaire produit ou consulte pour lui-même.
 *
 * Déclarés UNE fois. La barre large les range sous un déroulant « Outils » ; le tiroir
 * étroit les pose à plat sous un intertitre — un déroulant dans un tiroir demanderait
 * deux taps pour arriver au même endroit. Deux présentations, une seule liste : sans ça,
 * ajouter un outil obligerait à penser à le déclarer aux deux endroits.
 */
const OUTILS = [
  { to: "/empatements", ic: "wheat", label: "Mes empâtements" },
  { to: "/garnitures", ic: "list-checks", label: "Mes garnitures" },
  { to: "/realisations", ic: "pizza", label: "Mes réalisations" },
  /* « Maîtrise sanitaire » (/hygiene) RETIRÉE : l'entrée existait, la page jamais. Aucune route
     ne servait ce chemin, et le `path="*"` de fin renvoyait donc le stagiaire sur /mon-espace
     sans un mot — un menu qui promet un outil et ramène à l'accueil use la confiance qu'on a
     dans les autres. */
  { to: "/notions", ic: "book-open", label: "Notions & lexique" },
];

/** Bouton d'une destination verrouillée, dans la barre large. */
function LockedBtn({ children }) {
  return (
    <button className="btn sm ghost" disabled title={LOCK_TITLE}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.55 }}>
      <Icon name="lock" size={13} /> {children}
    </button>
  );
}

/**
 * Menu déroulant « Outils » (barre large uniquement).
 *
 * La Communauté en a été SORTIE : elle n'est pas un outil mais un lieu, et la ranger avec
 * eux la cachait derrière un déroulant alors qu'elle se visite d'un clic.
 */
function OutilsMenu({ locked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  const active = OUTILS.some((o) => loc.pathname.startsWith(o.to));
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (locked) return <LockedBtn>Outils</LockedBtn>;
  return (
    <span ref={ref} style={{ position: "relative" }}>
      <button className={`btn sm ${active ? "primary" : "ghost"}`} onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        Outils <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div className="stu-menu">
          {OUTILS.map((o) => (
            <NavLink key={o.to} to={o.to} className="stu-menu-item"><Icon name={o.ic} size={15} /> {o.label}</NavLink>
          ))}
        </div>
      )}
    </span>
  );
}

/** Une destination dans le tiroir étroit : pleine largeur, cible tactile confortable. */
function DrawerLink({ to, ic, label, badge, locked }) {
  if (locked) return (
    <span className="stu-drawer-item locked" title={LOCK_TITLE}>
      <Icon name="lock" size={16} /> {label}
    </span>
  );
  return (
    <NavLink to={to} className={({ isActive }) => `stu-drawer-item${isActive ? " on" : ""}`}>
      <Icon name={ic} size={16} /> <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && <span className="stu-count">{badge}</span>}
    </NavLink>
  );
}

/** Coquille de l'espace stagiaire : en-tête simple, pas de barre latérale. */
function StudentLayout() {
  const { user, isConnected, isLoading, logout } = useContext(UserContext);
  const loc = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(true); // fail-open : débloqué par défaut
  const [pending, setPending] = useState(0);      // documents à signer / QCM à faire
  const [news, setNews] = useState(0);            // commentaires nouveaux dans la Communauté
  const [done, setDone] = useState(0);            // formations terminées → cadre de l'avatar
  const choixCadre = useCadreChoisi(user?.id);    // resynchronisé dès qu'il change de cadre
  const [exclusifs, setExclusifs] = useState([]); // cadres exclusifs accordés par l'école
  const [avatar, setAvatar] = useState(() => getAvatar(user?.id));
  const [menuOpen, setMenuOpen] = useState(false); // tiroir de navigation, sous 900px
  // A-t-il franchi le point d'accès (breakpoint) d'une formation ? Débloque Pizza Quest + Outils.
  useEffect(() => {
    if (!user?.id) return;
    // Relancé à chaque changement de page : la pastille se met donc à jour dès qu'un
    // document est signé, sans rechargement.
    getMyAccess()
      .then((r) => {
        setUnlocked(r?.data?.quest_unlocked !== false);
        setPending(Number(r?.data?.pending_docs) || 0);
        setNews(Number(r?.data?.community_news) || 0);
        setDone(Number(r?.data?.formations_done) || 0);
        setExclusifs(r?.data?.cadres_exclusifs || []);
      })
      .catch(() => setUnlocked(true));
    // Rejoué à chaque changement de page : quitter la Communauté suffit donc à voir la
    // pastille retomber, sans rechargement.
  }, [user?.id, loc.pathname]);
  // La Communauté est rendue dans l'Outlet, la pastille vit ici : sans ce signal, ouvrir une
  // fiche commentée laisserait le compteur figé jusqu'au prochain changement de page. On
  // redemande le total au serveur plutôt que de le décrémenter — un compte tenu côté
  // navigateur dériverait dès qu'un commentaire arrive pendant la visite.
  useEffect(() => {
    if (!user?.id) return;
    const recompter = () => getMyAccess()
      .then((r) => setNews(Number(r?.data?.community_news) || 0))
      .catch(() => {});
    window.addEventListener(COMMUNITY_EVENT, recompter);
    return () => window.removeEventListener(COMMUNITY_EVENT, recompter);
  }, [user?.id]);
  useEffect(() => {
    const sync = () => setAvatar(getAvatar(user?.id));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [user?.id]);
  // Charge le profil (avatar + progression) depuis la base et le fusionne au local.
  useEffect(() => { if (user?.id) hydrateProfile(user.id); }, [user?.id]);
  // Naviguer referme le tiroir : sinon il masquerait la page qu'on vient d'ouvrir.
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  // Repasser en large avec le tiroir ouvert laisserait un panneau fantôme par-dessus la page :
  // la barre complète est de retour et le bouton menu, lui, a disparu — plus rien pour le fermer.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = (e) => { if (e.matches) setMenuOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash"><img src={LOGO} alt="" /><span>Impastio</span></div>
      </div>
    );
  }
  if (!isConnected) return <Navigate to="/login" replace />;

  // Destinations hors « Outils », dans l'ordre de la barre. `gated` = fermé tant que le
  // point d'accès n'est pas franchi.
  const extras = [
    { to: "/communaute", ic: "users", label: "Communauté", gated: true, badge: news },
    ...(user?.role === "INTERVENANT" ? [{ to: "/intervention", ic: "clipboard-check", label: "Intervention" }] : []),
    ...(user?.has_company ? [{ to: "/entreprise-documents", ic: "building", label: "Entreprise" }] : []),
  ];

  return (
    // `stu-app` porte toute la couche ludique (police ronde, coins doux, retour tactile,
    // fond chaud) — cf. styles/app.css. L'application d'administration ne la reçoit jamais.
    <div className="stu-app" style={{ minHeight: "100vh" }}>
      {/* En-tête ET tiroir dans un même bloc collant : c'est ce bloc qui colle, pas chacun de
          son côté. Le tiroir suit donc la barre sans qu'on ait à lui donner un décalage en
          pixels — un `top` en dur devrait valoir la hauteur exacte de la barre, qui change
          avec le palier (la marque disparaît à 560px) et avec la taille de police du système. */}
      <div className="stu-head">
      <header className="topbar stu-topbar">
        <div className="brand stu-brand" style={{ padding: 0, gap: 10 }}>
          <img src={LOGO} alt="École Pizza" style={{ width: 36, height: 36, borderRadius: 9, background: "#fff", padding: 3, objectFit: "contain" }} />
          <div>
            <div className="name" style={{ fontSize: 17 }}>Impastio</div>
            {/* Sous-titre décoratif : il cède la place au nom de marque sur un écran étroit. */}
            <div className="sub stu-sub" style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Espace stagiaire</div>
          </div>
        </div>

        <nav className="stu-nav">
          {/* Une seule entrée : documents reçus et formations vivent sur la même page.
              La pastille compte ce qui attend une action — signature ou QCM. */}
          <NavLink to="/mon-espace" className={navClass}
            title={pending > 0 ? `${pending} document${pending > 1 ? "s" : ""} à consulter ou signer` : undefined}>
            Mes documents
            {pending > 0 && <span className="stu-count">{pending}</span>}
          </NavLink>
          {/* Pizza Quest verrouillé tant que les documents ne sont pas signés (feature « accès »).
              La Boutique reste accessible — elle n'est PAS dans GATED_PATHS : c'est un service,
              pas du contenu pédagogique. */}
          {unlocked ? <NavLink to="/pizza-quest" className={navClass}>Pizza Quest</NavLink> : <LockedBtn>Pizza Quest</LockedBtn>}
          <NavLink to="/boutique" className={navClass}>Boutique</NavLink>
          <OutilsMenu locked={!unlocked} />
          {extras.map((e) => (
            e.gated && !unlocked
              ? <LockedBtn key={e.to}>{e.label}</LockedBtn>
              : <NavLink key={e.to} to={e.to} className={navClass}
                  title={e.badge > 0 ? `${e.badge} nouveau${e.badge > 1 ? "x" : ""} commentaire${e.badge > 1 ? "s" : ""}` : undefined}>
                  {e.label}
                  {e.badge > 0 && <span className="stu-count">{e.badge}</span>}
                </NavLink>
          ))}
        </nav>

        <div className="spacer" />
        <ThemeToggle />
        {/* Le changement de mot de passe vit dans le profil (onglet Compte) : le doubler
            dans la barre en faisait la seconde action la plus visible de l'espace. */}
        {/* L'avatar de la barre porte le cadre, comme le promet le profil (« il entoure ton
            avatar PARTOUT »). C'est le seul endroit visible sur toutes les pages : sans lui,
            choisir un cadre restait sans effet visible tant qu'on n'ouvrait pas la Communauté. */}
        <AvatarCadre
          avatar={avatar}
          initiales={initials(user?.first_name, user?.last_name)}
          cadre={cadreValeur(cadrePorteDe(choixCadre, done, exclusifs))}
          size={38}
          title="Mon profil"
          onClick={() => setProfileOpen(true)}
        />
        <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion"><Icon name="power" size={18} /></button>
        {/* Bouton du tiroir : présent uniquement sous 900px, où la barre ne tient plus.
            La pastille y est reportée — documents ET Communauté —, sinon replier la barre
            masquerait l'alerte. */}
        <button className="icon-btn stu-burger" onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen}>
          <Icon name={menuOpen ? "x" : "menu"} size={20} />
          {!menuOpen && (pending > 0 || news > 0) && <span className="stu-burger-dot" />}
        </button>
      </header>

      {/* Tiroir de navigation (écrans étroits). Rendu seulement à l'ouverture : fermé, il ne
          coûte rien et ne peut pas capter le focus au clavier. */}
      {menuOpen && (
          <div className="stu-drawer" role="navigation">
            <DrawerLink to="/mon-espace" ic="file-text" label="Mes documents" badge={pending} />
            <DrawerLink to="/pizza-quest" ic="pizza" label="Pizza Quest" locked={!unlocked} />
            <DrawerLink to="/boutique" ic="cart" label="Boutique" />
            <div className="stu-drawer-lbl">Outils</div>
            {OUTILS.map((o) => <DrawerLink key={o.to} {...o} locked={!unlocked} />)}
            <div className="stu-drawer-sep" />
            {extras.map((e) => <DrawerLink key={e.to} {...e} locked={e.gated && !unlocked} />)}
          </div>
      )}
      </div>
      {/* Le voile est HORS du bloc collant : il doit couvrir tout l'écran, pas seulement la
          hauteur de l'en-tête. */}
      {menuOpen && <div className="stu-scrim" onClick={() => setMenuOpen(false)} />}

      {/* 1060 et non 900 : les cartes de formation sont sur trois colonnes — à 900px elles
          tombaient sous 280px et le titre du programme passait sur trois lignes. */}
      <main className="content" style={{ maxWidth: 1060 }}>
        {!unlocked && GATED_PATHS.some((p) => loc.pathname.startsWith(p)) ? (
          <EmptyState icon="lock">
            <b>Section verrouillée.</b><br />Signez d'abord vos documents jusqu'au <b>point d'accès</b> de votre formation pour débloquer Pizza Quest et les outils.
          </EmptyState>
        ) : (
          <Outlet />
        )}
      </main>

      {/* La demande de consentement, posée UNE FOIS. Elle décide seule si elle doit s'afficher :
          uniquement quand une finalité n'a jamais été soumise. Un refus ne la rouvre pas. */}
      <ConsentModal />
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

export default StudentLayout;
