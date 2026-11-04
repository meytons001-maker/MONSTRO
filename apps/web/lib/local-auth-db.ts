import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function workspaceRoot() { const cwd=process.cwd(); return existsSync(resolve(cwd,"packages"))?cwd:resolve(cwd,"../.."); }
export function localAuthPath(){return process.env.MONSTRO_AUTH_DB??resolve(workspaceRoot(),"data/local-auth.sqlite")}
export function localAuthDatabase(){const path=localAuthPath();mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS auth_login_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,ip_hash TEXT NOT NULL,succeeded INTEGER NOT NULL,attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS auth_login_attempts_window ON auth_login_attempts(email,ip_hash,attempted_at);");return db}
export function hashIp(ip:string){return createHash("sha256").update(ip).digest("hex")}
export function upsertLocalAdmin(email:string,passwordHash:string,name:string){const db=localAuthDatabase();try{const current=db.prepare("SELECT id FROM auth_users WHERE email=?").get(email) as {id?:string}|undefined;db.prepare("INSERT INTO auth_users(id,email,password_hash,name,active) VALUES(?,?,?,?,1) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,name=excluded.name,active=1,updated_at=CURRENT_TIMESTAMP").run(current?.id??randomUUID(),email,passwordHash,name)}finally{db.close()}}
