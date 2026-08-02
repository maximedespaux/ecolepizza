import { createContext, useEffect, useState } from "react";
import { getCurrentUser, logout as apiLogout } from "../api/apiClient.js";
import { clearRevealConfirmSkip, clearMoneyReveal } from "../lib/moneyPrivacy.js";

export const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const value = { user, isConnected, isLoading, setUser, logout };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
