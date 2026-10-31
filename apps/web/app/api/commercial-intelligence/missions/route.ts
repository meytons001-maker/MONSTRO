import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function databasePath() { return process.env.MONSTRO_LEAD_DB ?? resolve(process.cwd(), "../../data/lead-intelligence.duckdb"); }
async function leadModule() {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "../../packages/lead-intelligence/dist/index.js")).href;
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@monstro/lead-intelligence")>;
  return runtimeImport(moduleUrl);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { intent?: unknown; limit?: unknown };
    if (typeof body.intent !== "string") return NextResponse.json({ error: "Um comando textual é obrigatório." }, { status: 400 });
    const { executeCommercialMission } = await leadModule();
    return NextResponse.json(await executeCommercialMission(databasePath(), { intent: body.intent, limit: typeof body.limit === "number" ? body.limit : 25 }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na missão comercial.";
    return NextResponse.json({ error: message }, { status: /obrigatório|excede/.test(message) ? 400 : 500 });
  }
}
