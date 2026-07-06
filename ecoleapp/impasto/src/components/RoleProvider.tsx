"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Profile, profileById } from "@/lib/auth/profiles";

const KEY = "impasto_profile";   // profil de démo (sélecteur de rôle)
const USER = "impasto_user";     // vraie session (connexion stagiaire réelle)

interface RoleCtxValue {
  profile: Profile | null;
  ready: boolean;
  setProfile: (id: string) => void;   // profil de démo
  signInUser: (p: Profile) => void;   // connexion réelle (stagiaire)
  signOut: () => void;
}

const RoleCtx = createContext<RoleCtxValue>({
  profile: null, ready: false, setProfile: () => {}, signInUser: () => {}, signOut: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Une vraie session (stagiaire connecté) a priorité sur le profil de démo.
    try {
      const raw = localStorage.getItem(USER);
      if (raw) { setProfileState(JSON.parse(raw) as Profile); setReady(true); return; }
    } catch { /* ignore */ }
    setProfileState(profileById(localStorage.getItem(KEY)) ?? null);
    setReady(true);
  }, []);

  const setProfile = useCallback((id: string) => {
    const p = profileById(id);
    if (!p) return;
    localStorage.removeItem(USER);
    localStorage.setItem(KEY, id);
    setProfileState(p);
  }, []);

  const signInUser = useCallback((p: Profile) => {
    localStorage.removeItem(KEY);
    localStorage.setItem(USER, JSON.stringify(p));
    setProfileState(p);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER);
    setProfileState(null);
  }, []);

  return <RoleCtx.Provider value={{ profile, ready, setProfile, signInUser, signOut }}>{children}</RoleCtx.Provider>;
}

export const useRole = () => useContext(RoleCtx);
