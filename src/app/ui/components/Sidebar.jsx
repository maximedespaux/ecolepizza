import { NavLink } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { NAV, canAccess } from "../lib/nav.js";
import { getBadges } from "../api/apiClient.js";
import { onBadgesRefresh } from "../lib/events.js";
import { initials } from "../lib/format.js";

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
  const { user } = useContext(UserContext);
  const role = user?.role;
  const [badges, setBadges] = useState({});

  useEffect(() => {
    let active = true;
    const load = () => getBadges().then((r) => { if (active) setBadges(r.data || {}); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const off = onBadgesRefresh(load); // rafraîchit après une action (suppression, paiement…)
    return () => { active = false; clearInterval(t); off(); };
  }, []);

  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <img src={LOGO} alt="École Pizza" />
        <div>
          <div className="name">Impasto</div>
          <div className="sub">École Pizza · Despaux</div>
        </div>
      </div>

      <nav className="menu">
        {NAV.map((group) => {
          const items = group.items.filter((it) => canAccess(role, it.roles));
          if (items.length === 0) return null;
          return (
            <div key={group.grp}>
              <div className="grp">{group.grp}</div>
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? "on" : "")}>
                  <span className="ic">{it.ic}</span> {it.label}
                  {badges[it.to] > 0 && <span className="count">{badges[it.to]}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="avatar">{initials(user?.first_name, user?.last_name)}</div>
        <div>
          <div className="who">{user ? `${user.first_name} ${user.last_name}` : "—"}</div>
          <div className="role">{ROLE_LABELS[role] || ""}</div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
