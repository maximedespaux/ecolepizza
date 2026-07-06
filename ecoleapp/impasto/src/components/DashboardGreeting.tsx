"use client";
import { useRole } from "./RoleProvider";

export default function DashboardGreeting() {
  const { profile } = useRole();
  const prenom = profile?.name.split(" ")[0] ?? "";
  return <h1>Bonjour{prenom ? `, ${prenom}` : ""} 👋</h1>;
}
