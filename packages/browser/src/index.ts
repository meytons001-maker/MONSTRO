import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { assertPublicDestination, type AddressResolver, type BrowserConsoleEntry, type BrowserRequestEntry, type BrowserSession, type BrowserSessionFactory, type BrowserSnapshot } from "@monstro/inspector";

export interface ChromiumSessionOptions {
  executablePath: string;
  maxRequests?: number;
  maxConsoleEntries?: number;
  viewport?: { width: number; height: number };
  resolveImpl?: AddressResolver;
}

function consoleLevel(type: string): BrowserConsoleEntry["level"] {
  if (type === "error") return "error";
  if (type === "warning" || type === "warn") return "warn";
  if (type === "info") return "info";
  return "log";
}

class PlaywrightChromiumSession implements BrowserSession {
  private closed = false;
  constructor(private readonly browser: Browser, private readonly context: BrowserContext, private readonly page: Page, private readonly maxRequests: number, private readonly maxConsoleEntries: number, private readonly resolveImpl?: AddressResolver) {}

  async navigate(url: string, options: { timeoutMs: number }): Promise<BrowserSnapshot> {
    const requests: BrowserRequestEntry[] = [];
    const consoleEntries: BrowserConsoleEntry[] = [];
    const runtimeErrors: string[] = [];
    const responseStatus = new Map<string, number>();

    await this.page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      let parsed: URL;
      try { parsed = new URL(requestUrl); } catch { await route.abort("blockedbyclient"); return; }
      if (!/^https?:$/.test(parsed.protocol)) { if (["data:", "blob:", "about:"].includes(parsed.protocol)) await route.continue(); else await route.abort("blockedbyclient"); return; }
      try { await assertPublicDestination(parsed, this.resolveImpl); await route.continue(); } catch { await route.abort("blockedbyclient"); }
    });
    this.page.on("response", (response) => { if (responseStatus.size < this.maxRequests * 2) responseStatus.set(response.url(), response.status()); });
    this.page.on("request", (request) => {
      if (requests.length >= this.maxRequests) return;
      requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType(), status: responseStatus.get(request.url()) });
    });
    this.page.on("console", (message) => { if (consoleEntries.length < this.maxConsoleEntries) consoleEntries.push({ level: consoleLevel(message.type()), text: message.text().slice(0, 2_000) }); });
    this.page.on("pageerror", (error) => { if (runtimeErrors.length < this.maxConsoleEntries) runtimeErrors.push(error.message.slice(0, 2_000)); });

    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await this.page.waitForLoadState("networkidle", { timeout: Math.min(options.timeoutMs, 2_000) }).catch(() => undefined);
    const document = await this.page.evaluate(() => ({
      title: document.title || undefined,
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || undefined,
      html: document.documentElement.outerHTML.slice(0, 512_000),
      canvasCount: document.querySelectorAll("canvas").length,
      headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    }));
    for (const request of requests) if (request.status === undefined) request.status = responseStatus.get(request.url);
    return { url: this.page.url(), ...document, console: consoleEntries, requests, runtimeErrors };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.context.close().catch(() => undefined);
    await this.browser.close().catch(() => undefined);
  }
}

export function createChromiumSessionFactory(options: ChromiumSessionOptions): BrowserSessionFactory {
  if (!options.executablePath.trim()) throw new Error("A Chromium executable path is required");
  const maxRequests = options.maxRequests ?? 128;
  const maxConsoleEntries = options.maxConsoleEntries ?? 64;
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  return async () => {
    const browser = await chromium.launch({ executablePath: options.executablePath, headless: true, args: ["--disable-dev-shm-usage"] });
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    const page = await context.newPage();
    return new PlaywrightChromiumSession(browser, context, page, maxRequests, maxConsoleEntries, options.resolveImpl);
  };
}
