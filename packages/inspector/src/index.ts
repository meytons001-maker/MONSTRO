import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { Evidence } from "@monstro/contracts";

export type AddressResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
export interface PublicUrlInspectorOptions { timeoutMs?: number; maxHtmlBytes?: number; maxAssets?: number; fetchImpl?: typeof fetch; resolveImpl?: AddressResolver; }
export interface ClientAsset { kind: string; url: string; sameOrigin: boolean; }
export interface ExperienceProfile { canvasCount: number; moduleScripts: number; technologies: string[]; interactiveAssets: number; signals: string[]; }

const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i;
const ASSET_ATTR = /<(script|link|img|source)\b[^>]*?\b(src|href)=["']([^"']+)["'][^>]*>/gi;
const INTERACTIVE_ASSET = /\.(?:glb|gltf|bin|hdr|exr|ktx2|basis|wasm)$/i;

function isPrivateAddress(address: string): boolean {
  if (PRIVATE_HOST.test(address)) return true;
  if (isIP(address) === 6) { const value = address.toLowerCase(); return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.") || /^::ffff:172\.(?:1[6-9]|2\d|3[01])\./.test(value); }
  return false;
}
async function defaultResolve(hostname: string): Promise<Array<{ address: string; family: number }>> { return lookup(hostname, { all: true, verbatim: true }); }

export function extractPublicHttpUrl(intent: string): URL | undefined {
  const match = intent.match(/https?:\/\/[^\s<>'"`]+/i); if (!match) return undefined;
  let url: URL; try { url = new URL(match[0].replace(/[),.;]+$/, "")); } catch { return undefined; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname)) return undefined; return url;
}
export async function assertPublicDestination(url: URL, resolveImpl: AddressResolver = defaultResolve): Promise<void> {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname)) throw new Error("Public inspection target is not allowed");
  if (isIP(url.hostname)) { if (isPrivateAddress(url.hostname)) throw new Error("Public inspection target resolves to a private address"); return; }
  const addresses = await resolveImpl(url.hostname); if (addresses.length === 0) throw new Error("Public inspection target did not resolve");
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Public inspection target resolves to a private address");
}
function textMatch(html: string, expression: RegExp): string | undefined { const value = html.match(expression)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return value || undefined; }
function assetKind(tag: string, rawUrl: string): string { const pathname = rawUrl.split(/[?#]/, 1)[0]?.toLowerCase() ?? ""; if (INTERACTIVE_ASSET.test(pathname)) return "interactive"; if (tag === "script") return "script"; if (tag === "img" || tag === "source") return "media"; if (pathname.endsWith(".css")) return "stylesheet"; return "resource"; }
export function inventoryClientAssets(html: string, baseUrl: URL, maxAssets = 64): ClientAsset[] {
  const assets: ClientAsset[] = []; const seen = new Set<string>();
  for (const match of html.matchAll(ASSET_ATTR)) { if (assets.length >= maxAssets) break; const raw = match[3]; if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) continue; let resolved: URL; try { resolved = new URL(raw, baseUrl); } catch { continue; } if (!/^https?:$/.test(resolved.protocol) || resolved.username || resolved.password || PRIVATE_HOST.test(resolved.hostname)) continue; const value = resolved.toString(); if (seen.has(value)) continue; seen.add(value); assets.push({ kind: assetKind(match[1]?.toLowerCase() ?? "", value), url: value, sameOrigin: resolved.origin === baseUrl.origin }); }
  return assets;
}

export function profileWebExperience(html: string, assets: ClientAsset[]): ExperienceProfile {
  const technologies = new Set<string>(); const signals: string[] = [];
  const haystack = `${html}\n${assets.map((asset) => asset.url).join("\n")}`.toLowerCase();
  const canvasCount = (html.match(/<canvas\b/gi) ?? []).length;
  const moduleScripts = (html.match(/<script\b[^>]*\btype=["']module["']/gi) ?? []).length;
  const interactiveAssets = assets.filter((asset) => asset.kind === "interactive").length;
  const detectors: Array<[string, RegExp]> = [["three.js", /(?:three(?:\.min)?\.js|three\/build|from\s*["']three["'])/i], ["react-three-fiber", /@react-three\/fiber/i], ["babylon.js", /babylon(?:\.js|js\.com|cdn)/i], ["aframe", /aframe(?:\.min)?\.js|<a-scene\b/i], ["model-viewer", /<model-viewer\b|@google\/model-viewer/i], ["webassembly", /\.wasm(?:[?#]|$)|webassembly/i]];
  for (const [name, pattern] of detectors) if (pattern.test(haystack)) technologies.add(name);
  if (canvasCount > 0) signals.push(`${canvasCount} canvas element(s)`);
  if (/\bwebgl2?\b|getcontext\s*\(\s*["']webgl/i.test(html)) signals.push("WebGL API reference");
  if (interactiveAssets > 0) signals.push(`${interactiveAssets} interactive/3D asset candidate(s)`);
  if (moduleScripts > 0) signals.push(`${moduleScripts} ES module script(s)`);
  return { canvasCount, moduleScripts, technologies: [...technologies], interactiveAssets, signals };
}

export class PublicUrlInspector {
  private readonly timeoutMs: number; private readonly maxHtmlBytes: number; private readonly maxAssets: number; private readonly fetchImpl: typeof fetch; private readonly resolveImpl: AddressResolver;
  constructor(options: PublicUrlInspectorOptions = {}) { this.timeoutMs = options.timeoutMs ?? 5_000; this.maxHtmlBytes = options.maxHtmlBytes ?? 512_000; this.maxAssets = options.maxAssets ?? 64; this.fetchImpl = options.fetchImpl ?? fetch; this.resolveImpl = options.resolveImpl ?? defaultResolve; }
  async inspect(url: URL): Promise<Evidence[]> {
    await assertPublicDestination(url, this.resolveImpl); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, redirect: "error", headers: { accept: "text/html,application/xhtml+xml" } });
      if (!response.ok) throw new Error(`Public URL returned HTTP ${response.status}`); const type = response.headers.get("content-type") ?? ""; if (!type.toLowerCase().includes("text/html")) throw new Error("Public URL is not an HTML document");
      const declared = Number(response.headers.get("content-length") ?? "0"); if (declared > this.maxHtmlBytes) throw new Error("Public HTML exceeds inspection budget"); const html = await response.text(); const bytes = Buffer.byteLength(html, "utf8"); if (bytes > this.maxHtmlBytes) throw new Error("Public HTML exceeds inspection budget");
      const title = textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i); const h1 = textMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i); const scripts = (html.match(/<script\b/gi) ?? []).length; const styles = (html.match(/<(?:style\b|link\b[^>]*rel=["']?stylesheet)/gi) ?? []).length; const images = (html.match(/<img\b/gi) ?? []).length;
      const assets = inventoryClientAssets(html, url, this.maxAssets); const profile = profileWebExperience(html, assets);
      return [
        { source: "reference:http", kind: "network", summary: `Public reference responded ${response.status}`, data: { url: url.toString(), status: response.status, contentType: type, bytes } },
        { source: "reference:document", kind: "visual", summary: `Public reference document${title ? `: ${title}` : ""}`, data: { title, h1, scripts, styles, images } },
        { source: "reference:assets", kind: "network", summary: `Observed ${assets.length} public client asset(s)${profile.interactiveAssets ? `, including ${profile.interactiveAssets} interactive/3D candidate(s)` : ""}`, data: { assets, truncated: assets.length >= this.maxAssets, interactiveAssets: profile.interactiveAssets } },
        { source: "reference:experience", kind: "code", summary: profile.signals.length || profile.technologies.length ? `Interactive experience signals: ${[...profile.technologies, ...profile.signals].join(", ")}` : "No explicit interactive-engine signals observed in initial HTML", data: profile },
      ];
    } finally { clearTimeout(timer); }
  }
}
