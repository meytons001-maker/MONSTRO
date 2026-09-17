import type { Evidence } from "@monstro/contracts";

export interface PublicUrlInspectorOptions { timeoutMs?: number; maxHtmlBytes?: number; fetchImpl?: typeof fetch; }

const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i;

export function extractPublicHttpUrl(intent: string): URL | undefined {
  const match = intent.match(/https?:\/\/[^\s<>'"`]+/i);
  if (!match) return undefined;
  let url: URL;
  try { url = new URL(match[0].replace(/[),.;]+$/, "")); } catch { return undefined; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname)) return undefined;
  return url;
}

function textMatch(html: string, expression: RegExp): string | undefined {
  const value = html.match(expression)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

export class PublicUrlInspector {
  private readonly timeoutMs: number;
  private readonly maxHtmlBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PublicUrlInspectorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxHtmlBytes = options.maxHtmlBytes ?? 512_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async inspect(url: URL): Promise<Evidence[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, redirect: "error", headers: { accept: "text/html,application/xhtml+xml" } });
      if (!response.ok) throw new Error(`Public URL returned HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (!type.toLowerCase().includes("text/html")) throw new Error("Public URL is not an HTML document");
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > this.maxHtmlBytes) throw new Error("Public HTML exceeds inspection budget");
      const html = await response.text();
      if (Buffer.byteLength(html, "utf8") > this.maxHtmlBytes) throw new Error("Public HTML exceeds inspection budget");
      const title = textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const h1 = textMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const scripts = (html.match(/<script\b/gi) ?? []).length;
      const styles = (html.match(/<(?:style\b|link\b[^>]*rel=["']?stylesheet)/gi) ?? []).length;
      const images = (html.match(/<img\b/gi) ?? []).length;
      return [
        { source: "reference:http", kind: "network", summary: `Public reference responded ${response.status}`, data: { url: url.toString(), status: response.status, contentType: type, bytes: Buffer.byteLength(html, "utf8") } },
        { source: "reference:document", kind: "visual", summary: `Public reference document${title ? `: ${title}` : ""}`, data: { title, h1, scripts, styles, images } },
      ];
    } finally { clearTimeout(timer); }
  }
}
