import assert from "node:assert/strict";
import test from "node:test";
import { PublicUrlInspector, assertPublicDestination, extractPublicHttpUrl, inventoryClientAssets } from "./index.ts";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

test("extracts public HTTP references and rejects local/private targets", () => {
  assert.equal(extractPublicHttpUrl("analyze https://example.com/demo")?.hostname, "example.com");
  assert.equal(extractPublicHttpUrl("analyze http://127.0.0.1:3000"), undefined);
  assert.equal(extractPublicHttpUrl("analyze http://192.168.1.2"), undefined);
  assert.equal(extractPublicHttpUrl("analyze https://user:pass@example.com"), undefined);
});

test("rejects public-looking hostnames that resolve to private destinations", async () => {
  await assert.rejects(() => assertPublicDestination(new URL("https://example.com"), async () => [{ address: "127.0.0.1", family: 4 }]), /private address/);
  await assert.rejects(() => assertPublicDestination(new URL("https://example.com"), async () => [{ address: "fd00::1", family: 6 }]), /private address/);
  await assert.doesNotReject(() => assertPublicDestination(new URL("https://example.com"), publicResolver));
});

test("inventories bounded public client assets without fetching them", () => {
  const html = `<script src="/app.js"></script><link rel="stylesheet" href="/app.css"><img src="https://cdn.example.org/hero.webp"><source src="/scene.glb"><script src="data:text/javascript,nope"></script>`;
  const assets = inventoryClientAssets(html, new URL("https://example.com/page"), 3);
  assert.deepEqual(assets, [
    { kind: "script", url: "https://example.com/app.js", sameOrigin: true },
    { kind: "stylesheet", url: "https://example.com/app.css", sameOrigin: true },
    { kind: "media", url: "https://cdn.example.org/hero.webp", sameOrigin: false },
  ]);
  const interactive = inventoryClientAssets(`<source src="/scene.glb"><link href="/env.hdr">`, new URL("https://example.com"));
  assert.equal(interactive[0]?.kind, "interactive");
  assert.equal(interactive[1]?.kind, "interactive");
});

test("produces bounded document, network and asset evidence", async () => {
  const inspector = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("<!doctype html><title>Reference</title><h1>World</h1><script src='/app.js'></script><img src='x'><source src='/scene.glb'>", { status: 200, headers: { "content-type": "text/html" } }) });
  const evidence = await inspector.inspect(new URL("https://example.com"));
  assert.equal(evidence.length, 3);
  assert.equal(evidence[0]?.source, "reference:http");
  assert.deepEqual(evidence[1]?.data, { title: "Reference", h1: "World", scripts: 1, styles: 0, images: 1 });
  const assetData = evidence[2]?.data as { assets: unknown[]; interactiveAssets: number };
  assert.equal(assetData.assets.length, 3);
  assert.equal(assetData.interactiveAssets, 1);
});

test("rejects redirects, non HTML responses and oversized documents", async () => {
  const redirect = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("", { status: 302 }) });
  await assert.rejects(() => redirect.inspect(new URL("https://example.com")));
  const json = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }) });
  await assert.rejects(() => json.inspect(new URL("https://example.com")), /not an HTML/);
  const huge = new PublicUrlInspector({ maxHtmlBytes: 4, resolveImpl: publicResolver, fetchImpl: async () => new Response("12345", { headers: { "content-type": "text/html" } }) });
  await assert.rejects(() => huge.inspect(new URL("https://example.com")), /exceeds inspection budget/);
});
