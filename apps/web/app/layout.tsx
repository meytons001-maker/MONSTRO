import type { Metadata } from "next";
import "./globals.css";
import { auth, signOut } from "../auth";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "MONSTRO",
  description: "Autonomous digital engineering cockpit",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/monstro-icon.svg", apple: "/monstro-icon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="pt-BR">
      <body>{session?.user && <form className="sessionBar" action={async()=>{"use server";await signOut({redirectTo:"/login"})}}><span>{session.user.email}</span><button>Sair</button></form>}{children}<PwaRegister/></body>
    </html>
  );
}
