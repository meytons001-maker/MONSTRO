import "server-only";
import { compare } from "bcryptjs";
import { postgres } from "./postgres";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function authenticateAdmin(emailValue: unknown, passwordValue: unknown, ip: string) {
  const email = String(emailValue ?? "").trim().toLowerCase();
  const password = String(passwordValue ?? "");
  if (!email || password.length < 8) return null;
  const db = postgres();
  const attempts = await db.query<{ total: string }>(
    "select count(*)::text total from auth_login_attempts where email=$1 and ip_hash=encode(digest($2, 'sha256'), 'hex') and succeeded=false and attempted_at > now() - ($3 || ' minutes')::interval",
    [email, ip, String(WINDOW_MINUTES)],
  );
  if (Number(attempts.rows[0]?.total ?? 0) >= MAX_ATTEMPTS) throw new Error("Muitas tentativas. Aguarde 15 minutos.");
  const user = await db.query<{ id: string; email: string; name: string; password_hash: string; active: boolean }>("select id,email,name,password_hash,active from auth_users where email=$1 limit 1", [email]);
  const valid = Boolean(user.rows[0]?.active) && await compare(password, user.rows[0]?.password_hash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  await db.query("insert into auth_login_attempts(email,ip_hash,succeeded) values($1,encode(digest($2, 'sha256'),'hex'),$3)", [email, ip, valid]);
  if (!valid) return null;
  await db.query("delete from auth_login_attempts where email=$1 and succeeded=false", [email]);
  return { id: user.rows[0].id, email: user.rows[0].email, name: user.rows[0].name };
}
