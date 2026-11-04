import "server-only";
import { compare } from "bcryptjs";
import { postgres } from "./postgres";
import { hashIp, localAuthDatabase } from "./local-auth-db";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function authenticateAdmin(emailValue: unknown, passwordValue: unknown, ip: string) {
  const email = String(emailValue ?? "").trim().toLowerCase();
  const password = String(passwordValue ?? "");
  if (!email || password.length < 8) return null;
  if (!process.env.DATABASE_URL) return authenticateLocal(email, password, ip);
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

async function authenticateLocal(email:string,password:string,ip:string){const db=localAuthDatabase();try{const ipHash=hashIp(ip);const attempts=db.prepare("SELECT count(*) total FROM auth_login_attempts WHERE email=? AND ip_hash=? AND succeeded=0 AND attempted_at > datetime('now','-15 minutes')").get(email,ipHash) as {total:number};if(Number(attempts.total)>=MAX_ATTEMPTS)throw new Error("Muitas tentativas. Aguarde 15 minutos.");const user=db.prepare("SELECT id,email,name,password_hash,active FROM auth_users WHERE email=? LIMIT 1").get(email) as {id:string;email:string;name:string;password_hash:string;active:number}|undefined;const valid=Boolean(user?.active)&&await compare(password,user?.password_hash??"$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");db.prepare("INSERT INTO auth_login_attempts(email,ip_hash,succeeded) VALUES(?,?,?)").run(email,ipHash,valid?1:0);if(!valid)return null;db.prepare("DELETE FROM auth_login_attempts WHERE email=? AND succeeded=0").run(email);return{id:user!.id,email:user!.email,name:user!.name}}finally{db.close()}}
