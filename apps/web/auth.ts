import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { authenticateAdmin } from "./lib/admin-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Senha", type: "password" } },
    authorize: async (credentials, request) => authenticateAdmin(credentials.email, credentials.password, request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"),
  })],
});
