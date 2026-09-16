import type { Evidence, ObservationResult, RuntimeResult } from "@monstro/contracts";

export type PreviewObservationOptions = { timeoutMs?: number; maxHtmlBytes?: number };

export class HttpPreviewObserver {
  constructor(private readonly options: PreviewObservationOptions = {}) {}

  async observe(url: string, runtime: RuntimeResult): Promise<ObservationResult> {
    const started = Date.now();
    if (!runtime.ok) return this.failed(runtime.stderr || "Runtime failed", started, "runtime", "runtime");
    const timeoutMs = this.options.timeoutMs ?? 1_500;
    const maxHtmlBytes = this.options.maxHtmlBytes ?? 512_000;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const contentType = response.headers.get("content-type");
      const html = await response.text();
      const htmlBytes = Buffer.byteLength(html);
      const evidence: Evidence[] = [{ source: "preview:http", kind: "network", summary: `GET / returned ${response.status}`, data: { status: response.status, contentType, htmlBytes } }];
      if (htmlBytes > maxHtmlBytes) return { ok: false, evidence: [...evidence, { source: "preview:document", kind: "runtime", summary: `Document exceeded observation limit (${htmlBytes} bytes)`, data: { htmlBytes, maxHtmlBytes } }], durationMs: Date.now() - started };
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
      evidence.push({ source: "preview:document", kind: "runtime", summary: `Document title: ${title || "missing"}`, data: { title, h1, htmlBytes } });
      return { ok: response.ok && htmlBytes > 0, evidence, durationMs: Date.now() - started };
    } catch (error) {
      return this.failed(error instanceof Error ? error.message : "Preview observation failed", started, "preview:http", "network");
    }
  }

  private failed(summary: string, started: number, source: string, kind: Evidence["kind"]): ObservationResult {
    return { ok: false, evidence: [{ source, kind, summary }], durationMs: Date.now() - started };
  }
}
