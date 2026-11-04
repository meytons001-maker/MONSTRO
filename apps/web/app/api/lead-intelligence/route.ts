import { NextResponse } from "next/server";
import type { ProductSegment } from "@monstro/lead-intelligence";
import { databasePath, leadModule, publicError } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let metricsCache: { value: unknown; expiresAt: number } | undefined;

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
    const requestStarted = performance.now();
    const { dashboard, exportCsv, getDatabaseQueueStatus, searchEstablishmentsPage } = await leadModule();
    const queueBefore = getDatabaseQueueStatus(databasePath());
    if (url.searchParams.get("format") === "csv") {
      return new Response(await exportCsv(databasePath(), { ...options, limit: 100_000 }), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=monstro-leads.csv", "x-monstro-export-limit": "100000" },
      });
    }
    const metricsStarted = performance.now();
    if (!metricsCache || metricsCache.expiresAt < Date.now()) metricsCache = { value: await dashboard(databasePath()), expiresAt: Date.now() + 300_000 };
    const metrics = metricsCache.value;
    const searchStarted = performance.now();
    const results = await searchEstablishmentsPage(databasePath(), options);
    const databaseTiming = getDatabaseQueueStatus(databasePath()).last;
    const completed = performance.now();
    const timing = { metricsMs: Math.round(searchStarted - metricsStarted), searchMs: Math.round(completed - searchStarted), totalMs: Math.round(completed - requestStarted), queueWaitMs: databaseTiming?.queueWaitMs ?? 0, duckdbMs: databaseTiming?.executionMs ?? 0, queueDepthAtStart: queueBefore.waiting + (queueBefore.active ? 1 : 0) };
    console.info("[lead-intelligence:search]", JSON.stringify({ ...timing, total: results.total, filters: { product: options.product, neighborhood: options.neighborhood, active: options.active, hasPhone: options.hasPhone, hasEmail: options.hasEmail, exactQuery: options.query?.replace(/\D/g, "").length === 14 } }));
    const response = NextResponse.json({ metrics, results, timing });
    response.headers.set("server-timing", `metrics;dur=${timing.metricsMs}, search;dur=${timing.searchMs}, total;dur=${timing.totalMs}`);
    return response;
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}
