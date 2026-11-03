import { hash } from "bcryptjs";
import { Pool } from "pg";
import { upsertLocalAdmin, localAuthPath } from "../lib/local-auth-db";

async function main(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.ADMIN_PASSWORD;const name=process.env.ADMIN_NAME??"Administrador";
  if(!email||!password||password.length<12)throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD com ao menos 12 caracteres.");
  const passwordHash=await hash(password,12);delete process.env.ADMIN_PASSWORD;
  if(!process.env.DATABASE_URL){upsertLocalAdmin(email,passwordHash,name);console.info(`Conta administrativa local preparada para ${email} em ${localAuthPath()}.`);return}
  const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="false"?false:{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=="false"}});
  try{const client=await db.connect();try{await client.query("begin");const org=await client.query<{id:string}>("insert into organizations(name) values($1) returning id",[process.env.ORGANIZATION_NAME??"MONSTRO"]);await client.query("insert into auth_users(organization_id,email,password_hash,name,role) values($1,$2,$3,$4,'admin') on conflict(email) do update set password_hash=excluded.password_hash,name=excluded.name,active=true,updated_at=now()",[org.rows[0].id,email,passwordHash,name]);await client.query("commit");console.info(`Conta administrativa preparada para ${email}.`)}catch(error){await client.query("rollback");throw error}finally{client.release()}}finally{await db.end()}
}

main().catch((error)=>{console.error(error instanceof Error?error.message:"Falha no bootstrap administrativo.");process.exitCode=1});
