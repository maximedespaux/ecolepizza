import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Impasto — Secrétariat · École Pizza",
  description: "ERP de formation pour l'École Pizza Jean-Jacques Despaux",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
