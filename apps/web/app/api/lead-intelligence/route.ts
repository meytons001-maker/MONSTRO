import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import type { ProductSegment } from "@monstro/lead-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function databasePath() {
  return process.env.MONSTRO_LEAD_DB ?? resolve(process.cwd(), "../../data/lead-intelligence.duckdb");
}

async function leadModule() {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "../../packages/lead-intelligence/dist/index.js")).href;
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@monstro/lead-intelligence")>;
  return runtimeImport(moduleUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get("product") as ProductSegment | null;
  const options = {
    query: url.searchParams.get("q") ?? undefined,
    product: product === "xmenu" || product === "cotare" ? product : undefined,
    active: url.searchParams.get("active") === "true" ? true : undefined,
    limit: 100,
  };
  try {
    const { dashboard, exportCsv, searchEstablishments } = await leadModule();
    if (url.searchParams.get("format") === "csv") {
      return new Response(await exportCsv(databasePath(), options), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=monstro-leads.csv" },
      });
    }
    // DuckDB permits one process-level handle for this local file. Keep dashboard
    // and search sequential so native instances never compete for the same lock.
    const metrics = await dashboard(databasePath());
    const establishments = await searchEstablishments(databasePath(), options);
    return NextResponse.json({ metrics, establishments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lead Intelligence unavailable." }, { status: 500 });
  }
}
