import { NextResponse } from "next/server";
import type { ProductSegment } from "@monstro/lead-intelligence";
import { databasePath, leadModule, publicError } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get("product") as ProductSegment | null;
  const options = {
    query: url.searchParams.get("q") ?? undefined,
    product: product === "xmenu" || product === "cotare" ? product : undefined,
    active: url.searchParams.get("active") === "true" ? true : undefined,
    neighborhood: url.searchParams.get("neighborhood") ?? undefined,
    hasPhone: url.searchParams.get("hasPhone") === "true" || undefined,
    hasEmail: url.searchParams.get("hasEmail") === "true" || undefined,
    limit: Math.min(250, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50))),
    offset: Math.max(0, (Number(url.searchParams.get("page") ?? 1) - 1) * Math.min(250, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)))),
  };
  try {
    const { dashboard, exportCsv, searchEstablishmentsPage } = await leadModule();
    if (url.searchParams.get("format") === "csv") {
      return new Response(await exportCsv(databasePath(), { ...options, limit: 100_000 }), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=monstro-leads.csv", "x-monstro-export-limit": "100000" },
      });
    }
    // DuckDB permits one process-level handle for this local file. Keep dashboard
    // and search sequential so native instances never compete for the same lock.
    const metrics = await dashboard(databasePath());
    const results = await searchEstablishmentsPage(databasePath(), options);
    return NextResponse.json({ metrics, results });
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}

