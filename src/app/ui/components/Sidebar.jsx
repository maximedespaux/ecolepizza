import { NavLink, useNavigate } from "react-router-dom";
import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { NAV, canOpen, SETTINGS_PATHS, badgesParRubrique } from "../lib/nav.js";
import { getBadges } from "../api/apiClient.js";
import { onBadgesRefresh } from "../lib/events.js";
import { initials } from "../lib/format.js";
import ChangePasswordModal from "./ChangePasswordModal.jsx";
import ProfilPersonnel from "./ProfilPersonnel.jsx";
import { parseAvatar, getAvatar, AVATAR_EVENT } from "../lib/gamification.js";
import { useCadreChoisi, cadreClass } from "../lib/cadres.js";
import { Icon } from "./Icon.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

const ROLE_LABELS = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN_ORGANISME: "Administrateur",
  SECRETARIAT: "Secrétariat",
  FORMATEUR: "Formateur",
  STAGIAIRE: "Stagiaire",
  ENTREPRISE: "Entreprise",
  FINANCEUR: "Financeur",
  AUDITEUR: "Auditeur",
};

/** Barre latérale : marque, menu groupé filtré par rôle, pied utilisateur. */
function Sidebar({ open }) {
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const role = user?.role;
  // Rubriques « Paramètres » (Organisme, Équipe, Rôles) : accessibles via le menu profil.
  const settingsItems = NAV.flatMap((g) => g.items).filter((it) => SETTINGS_PATHS.includes(it.to));
  const hasParams = settingsItems.some((it) => canOpen(user, it));
  const [badges, setBadges] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [profilOpen, setProfilOpen] = useState(false);
  /* L'avatar du pied, resynchronisé À CHAUD. Sans l'écoute de l'évènement, choisir sa pizza
     dans la modale ne se voyait qu'après un rechargement : la modale se ferme sur un pied
     inchangé, et on recommence en croyant que ça n'a pas marché. Même défaut que celui déjà
     corrigé sur les cadres (cf. `useCadreChoisi`). La base fait foi, le navigateur prend le
     relais tant que la migration 126 n'est pas jouée. */
  const cadreChoisi = useCadreChoisi(user?.id) || user?.cadre || null;
  const [monAvatar, setMonAvatar] = useState(() => parseAvatar(user?.avatar) || getAvatar(user?.id));
  useEffect(() => {
    const sync = () => setMonAvatar(getAvatar(user?.id) || parseAvatar(user?.avatar));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [user?.id, user?.avatar]);
  const footRef = useRef(null);

  useEffect(() => {
    let active = true;
    // Les pastilles arrivent par PAGE ; on les remonte sur la rubrique qui les portera.
    const load = () => getBadges().then((r) => { if (active) setBadges(badgesParRubrique(r.data)); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const off = onBadgesRefresh(load); // rafraîchit après une action (suppression, paiement…)
    return () => { active = false; clearInterval(t); off(); };
  }, []);

  // Ferme le menu profil au clic à l'extérieur ou sur Échap.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (footRef.current && !footRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <img src={LOGO} alt="École Pizza" />
        <div>
          <div className="name">Impastio</div>
          <div className="sub">École Pizza · Despaux</div>
        </div>
      </div>

      <nav className="menu">
        {NAV.map((group) => {
          const items = group.items.filter((it) => canOpen(user, it) && !SETTINGS_PATHS.includes(it.to));
          if (items.length === 0) return null;
          return (
            <div key={group.grp}>
              <div className="grp">{group.grp}</div>
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? "on" : "")}>
                  <span className="ic"><Icon name={it.ic} size={18} /></span> {it.label}
                  {badges[it.to] > 0 && <span className="count">{badges[it.to]}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="side-foot-wrap" ref={footRef}>
        {menuOpen && (
          <div className="profile-menu" role="menu">
            {/* « Personnalisation » d'abord : c'est MON compte, avant les réglages de l'organisme.
                L'intervenant n'y a pas accès — il n'entre jamais par cette barre latérale, il
                passe par l'espace stagiaire, qui a déjà son propre profil. */}
            <button role="menuitem" onClick={() => { setMenuOpen(false); setProfilOpen(true); }}>
              <span className="ic"><Icon name="user" size={16} /></span> Personnalisation
            </button>
            {hasParams && (
              <button role="menuitem" onClick={() => { setMenuOpen(false); navigate("/parametres"); }}>
                <span className="ic"><Icon name="settings" size={16} /></span> Paramètres
              </button>
            )}
            <button role="menuitem" onClick={() => { setMenuOpen(false); setPwOpen(true); }}>
              <span className="ic"><Icon name="key" size={16} /></span> Changer le mot de passe
            </button>
            <button role="menuitem" className="danger" onClick={() => { setMenuOpen(false); logout(); }}>
              <span className="ic"><Icon name="power" size={16} /></span> Déconnexion
            </button>
          </div>
        )}
        <button
          type="button"
          className={"side-foot" + (menuOpen ? " open" : "")}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Mon profil"
        >
          <div className={"avatar " + cadreClass(cadreChoisi)} style={monAvatar ? { background: monAvatar.color } : undefined}>
            {monAvatar ? monAvatar.emoji : initials(user?.first_name, user?.last_name)}
          </div>
          <div>
            <div className="who">{user ? `${user.first_name} ${user.last_name}` : "-"}</div>
            <div className="role">{ROLE_LABELS[role] || ""}</div>
          </div>
          <span className="chev"><Icon name="chevron-down" size={16} style={{ transform: menuOpen ? "none" : "rotate(180deg)", transition: "transform .2s var(--ease)" }} /></span>
        </button>
      </div>

      {profilOpen && <ProfilPersonnel onClose={() => setProfilOpen(false)} />}
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </aside>
  );
}

export default Sidebar;
