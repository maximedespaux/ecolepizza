import AppShell from "@/components/AppShell";
import { RoleProvider } from "@/components/RoleProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AppShell>{children}</AppShell>
    </RoleProvider>
  );
}
