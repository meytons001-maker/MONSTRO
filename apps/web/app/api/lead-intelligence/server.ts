import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function workspaceRoot() {
  const cwd = process.cwd();
  return existsSync(resolve(cwd, "packages/lead-intelligence")) ? cwd : resolve(cwd, "../..");
}

export function databasePath() {
  return process.env.MONSTRO_LEAD_DB ?? resolve(workspaceRoot(), "data/lead-intelligence.duckdb");
}

export async function leadModule() {
  await access(databasePath());
  const moduleUrl = pathToFileURL(resolve(workspaceRoot(), "packages/lead-intelligence/dist/index.js")).href;
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@monstro/lead-intelligence")>;
  return runtimeImport(moduleUrl);
}

export function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "Lead Intelligence indisponível.";
  console.error("[lead-intelligence]", error);
  if (message.includes("ENOENT")) return "Banco DuckDB não encontrado. Verifique MONSTRO_LEAD_DB e execute a importação.";
  if (message.includes("Cannot find module")) return "Módulo Lead Intelligence não compilado. Execute o build do pacote e tente novamente.";
  if (message.toLowerCase().includes("lock")) return "A base está ocupada por outro processo. Aguarde alguns segundos e tente novamente.";
  return message;
}

