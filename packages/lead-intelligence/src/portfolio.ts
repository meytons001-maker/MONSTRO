import { randomUUID } from "node:crypto";
import { rows, sql, withDatabase } from "./duckdb.js";
import { SCHEMA_SQL } from "./schema.js";

const STAGES = ["new", "researching", "qualified", "contacted", "meeting", "proposal", "won", "lost"] as const;
export type CommercialStage = typeof STAGES[number];

export interface UpsertCommercialAccountInput { cnpj: string; product: string; owner?: string; stage: CommercialStage; nextActivityAt?: string; notes?: string; leadOrigin: string; }
export interface RegisterInteractionInput { cnpj: string; product: string; interactionType: string; summary: string; owner?: string; occurredAt?: string; nextActivityAt?: string; }

function timestamp(value?: string) { return value ? `try_cast(${sql(value)} AS TIMESTAMP)` : "NULL"; }
function validateCnpj(value: string) { const cnpj = value.replace(/\D/g, ""); if (cnpj.length !== 14) throw new Error("CNPJ inválido."); return cnpj; }

export async function upsertCommercialAccount(databasePath: string, input: UpsertCommercialAccountInput) {
  const cnpj = validateCnpj(input.cnpj); const product = input.product.trim();
  if (!product) throw new Error("Produto é obrigatório.");
  if (!STAGES.includes(input.stage)) throw new Error("Situação comercial inválida.");
  await withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    const exists = (await rows(connection, `SELECT 1 found FROM establishments WHERE cnpj=${sql(cnpj)} LIMIT 1`))[0];
    if (!exists) throw new Error("Empresa não encontrada na base cadastrada.");
    await connection.run("BEGIN TRANSACTION");
    try {
      await connection.run(`INSERT INTO commercial_accounts (cnpj,product,owner,stage,next_activity_at,notes,lead_origin) VALUES (${sql(cnpj)},${sql(product)},${input.owner ? sql(input.owner) : "NULL"},${sql(input.stage)},${timestamp(input.nextActivityAt)},${input.notes ? sql(input.notes) : "NULL"},${sql(input.leadOrigin)}) ON CONFLICT (cnpj,product) DO UPDATE SET owner=excluded.owner,stage=excluded.stage,next_activity_at=excluded.next_activity_at,notes=excluded.notes,lead_origin=excluded.lead_origin,updated_at=now()`);
      await connection.run(`INSERT INTO commercial_account_history (id,cnpj,product,action,details) VALUES (${sql(randomUUID())},${sql(cnpj)},${sql(product)},'account_upserted',${sql(JSON.stringify({ owner: input.owner ?? null, stage: input.stage, nextActivityAt: input.nextActivityAt ?? null, leadOrigin: input.leadOrigin }))})`);
      await connection.run("COMMIT");
    } catch (error) { await connection.run("ROLLBACK"); throw error; }
  });
  return getCommercialAccount(databasePath, cnpj, product);
}

export async function registerCommercialInteraction(databasePath: string, input: RegisterInteractionInput) {
  const cnpj = validateCnpj(input.cnpj); const product = input.product.trim(); const summary = input.summary.trim();
  if (!product || !summary || !input.interactionType.trim()) throw new Error("Produto, tipo e resumo da interação são obrigatórios.");
  const id = randomUUID();
  await withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL); await connection.run("BEGIN TRANSACTION");
    try {
      await connection.run(`INSERT INTO commercial_interactions (id,cnpj,product,interaction_type,occurred_at,summary,owner,next_activity_at) VALUES (${sql(id)},${sql(cnpj)},${sql(product)},${sql(input.interactionType.trim())},coalesce(${timestamp(input.occurredAt)},current_timestamp),${sql(summary)},${input.owner ? sql(input.owner) : "NULL"},${timestamp(input.nextActivityAt)})`);
      await connection.run(`UPDATE commercial_accounts SET last_contact_at=coalesce(${timestamp(input.occurredAt)},now()),next_activity_at=${timestamp(input.nextActivityAt)},updated_at=now() WHERE cnpj=${sql(cnpj)} AND product=${sql(product)}`);
      await connection.run(`INSERT INTO commercial_account_history (id,cnpj,product,action,details) VALUES (${sql(randomUUID())},${sql(cnpj)},${sql(product)},'interaction_registered',${sql(JSON.stringify({ interactionId: id, type: input.interactionType, summary }))})`);
      await connection.run("COMMIT");
    } catch (error) { await connection.run("ROLLBACK"); throw error; }
  });
  return { id };
}

export async function getCommercialAccount(databasePath: string, cnpjInput: string, product?: string) {
  const cnpj = validateCnpj(cnpjInput);
  return withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    const filter = product ? `AND product=${sql(product)}` : "";
    const accounts = await rows(connection, `SELECT cnpj,product,owner,stage,cast(last_contact_at AS VARCHAR) last_contact_at,cast(next_activity_at AS VARCHAR) next_activity_at,notes,lead_origin,cast(created_at AS VARCHAR) created_at,cast(updated_at AS VARCHAR) updated_at FROM commercial_accounts WHERE cnpj=${sql(cnpj)} ${filter} ORDER BY updated_at DESC`);
    const interactions = await rows(connection, `SELECT id,product,interaction_type,cast(occurred_at AS VARCHAR) occurred_at,summary,owner,cast(next_activity_at AS VARCHAR) next_activity_at FROM commercial_interactions WHERE cnpj=${sql(cnpj)} ${filter} ORDER BY occurred_at DESC`);
    const history = await rows(connection, `SELECT product,action,details,cast(occurred_at AS VARCHAR) occurred_at FROM commercial_account_history WHERE cnpj=${sql(cnpj)} ${filter} ORDER BY occurred_at DESC`);
    return { accounts, interactions, history };
  });
}

export async function listCommercialAccounts(databasePath: string, limit = 100) {
  return withDatabase(databasePath, async (connection) => { await connection.run(SCHEMA_SQL); return rows(connection, `SELECT a.cnpj,a.product,a.owner,a.stage,cast(a.last_contact_at AS VARCHAR) last_contact_at,cast(a.next_activity_at AS VARCHAR) next_activity_at,a.lead_origin,coalesce(e.trade_name,c.legal_name,a.cnpj) company_name FROM commercial_accounts a LEFT JOIN establishments e ON e.cnpj=a.cnpj LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root ORDER BY a.updated_at DESC LIMIT ${Math.min(500, Math.max(1, limit))}`); });
}

