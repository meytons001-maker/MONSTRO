import type { NextAuthConfig } from "next-auth";

export default {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
  providers: [],
  callbacks: { authorized: ({ auth, request }) => auth?.user ? true : request.nextUrl.pathname.startsWith("/api/") ? Response.json({ error: "Sessão expirada. Entre novamente para continuar." }, { status: 401 }) : false },
} satisfies NextAuthConfig;
