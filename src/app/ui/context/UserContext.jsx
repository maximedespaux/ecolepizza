import { createContext, useEffect, useState } from "react";
import { getCurrentUser, logout as apiLogout, API_BASE_URL } from "../api/apiClient.js";
import { clearRevealConfirmSkip, clearMoneyReveal } from "../lib/moneyPrivacy.js";

export const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function hydrateUser() {
      try {
        const response = await getCurrentUser();
        if (!mounted) return;
        setUserState(response.data);
        setIsConnected(true);
      } catch {
        if (!mounted) return;
        setUserState(null);
        setIsConnected(false);
        try {
          /* On ne se fie PAS au seul code 200 : un repli SPA (ou une mauvaise route du proxy)
             renvoie « index.html » en 200 pour /api/health, ce qui ferait croire l'API debout.
             On exige donc la vraie réponse JSON `{status:"ok"}` — un 502, une page HTML ou un
             corps illisible signent tous une indisponibilité. */
          const r = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
          const j = await r.json().catch(() => null);
          if (mounted && (!r.ok || !j || j.status !== "ok")) setServerDown(true);
        } catch {
          if (mounted) setServerDown(true);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    hydrateUser();
    return () => {
      mounted = false;
    };
  }, []);

  const setUser = (userData) => {
    if (!userData) {
      setUserState(null);
      setIsConnected(false);
      return;
    }
    setUserState(userData);
    setIsConnected(true);
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      /* on ignore : on déconnecte côté client de toute façon */
    }
    clearRevealConfirmSkip(); // oublie le « ne plus demander » à la déconnexion
    clearMoneyReveal();       // …et le masque revient : la session suivante repart confidentielle
    setUser(null);
  };

  const value = { user, isConnected, isLoading, serverDown, setUser, logout };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
