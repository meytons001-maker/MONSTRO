import assert from "node:assert/strict";
import test from "node:test";
import { ControlledBrowserInspector, PublicUrlInspector, assertPublicDestination, extractPublicHttpUrl, inventoryClientAssets, profileRenderedExperience, profileWebExperience, type BrowserSession } from "./index.ts";

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
  assert.equal(interactive[0]?.kind, "interactive"); assert.equal(interactive[1]?.kind, "interactive");
});

test("profiles observable interactive and 3D technology signals", () => {
  const html = `<canvas id="scene"></canvas><script type="module" src="/three.min.js"></script><script>const gl = canvas.getContext('webgl2')</script><source src="/car.glb">`;
  const assets = inventoryClientAssets(html, new URL("https://example.com"));
  const profile = profileWebExperience(html, assets);
  assert.equal(profile.canvasCount, 1); assert.equal(profile.moduleScripts, 1); assert.equal(profile.interactiveAssets, 1);
  assert.ok(profile.technologies.includes("three.js")); assert.ok(profile.signals.includes("WebGL API reference"));
});

test("profiles known declarative 3D engines without claiming runtime execution", () => {
  const profile = profileWebExperience(`<a-scene></a-scene><model-viewer src="x.glb"></model-viewer>`, []);
  assert.ok(profile.technologies.includes("aframe")); assert.ok(profile.technologies.includes("model-viewer"));
});

test("profiles bounded rendered experience signals from observed browser data", () => {
  const profile = profileRenderedExperience({ url: "https://example.com", html: `<canvas></canvas><model-viewer></model-viewer>`, canvasCount: 1, headings: 0, console: [], requests: [], runtimeErrors: ["shader failed"] }, [{ url: "https://cdn.example.com/scene.glb?rev=1", method: "GET" }, { url: "https://cdn.example.com/runtime.wasm", method: "GET" }]);
  assert.equal(profile.canvasCount, 1); assert.equal(profile.interactiveRequests, 2); assert.equal(profile.runtimeErrors, 1);
  assert.ok(profile.technologies.includes("model-viewer")); assert.ok(profile.technologies.includes("webassembly"));
  assert.ok(profile.signals.includes("2 interactive/3D request(s)"));
});

test("produces bounded document, network, asset and experience evidence", async () => {
  const inspector = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("<!doctype html><title>Reference</title><h1>World</h1><canvas></canvas><script type='module' src='/three.js'></script><img src='x'><source src='/scene.glb'>", { status: 200, headers: { "content-type": "text/html" } }) });
  const evidence = await inspector.inspect(new URL("https://example.com"));
  assert.equal(evidence.length, 4); assert.equal(evidence[0]?.source, "reference:http");
  assert.deepEqual(evidence[1]?.data, { title: "Reference", h1: "World", scripts: 1, styles: 0, images: 1 });
  const assetData = evidence[2]?.data as { assets: unknown[]; interactiveAssets: number }; assert.equal(assetData.assets.length, 3); assert.equal(assetData.interactiveAssets, 1);
  const experience = evidence[3]?.data as { canvasCount: number; technologies: string[] }; assert.equal(experience.canvasCount, 1); assert.ok(experience.technologies.includes("three.js"));
});

test("controlled browser inspector emits rendered, network, runtime and experience evidence", async () => {
  let closed = false;
  const session: BrowserSession = { async navigate() { return { url: "https://example.com/app", title: "Rendered", h1: "Scene", html: "<canvas></canvas>", canvasCount: 2, headings: 3, console: [{ level: "info", text: "ready" }], requests: [{ url: "https://example.com/scene.glb", method: "GET", resourceType: "fetch", status: 200 }, { url: "http://127.0.0.1/private", method: "GET" }], runtimeErrors: [] }; }, async close() { closed = true; } };
  const inspector = new ControlledBrowserInspector({ createSession: async () => session, resolveImpl: publicResolver });
  const evidence = await inspector.inspect(new URL("https://example.com"));
  assert.equal(evidence.length, 4); assert.equal(evidence[0]?.source, "browser:document");
  const network = evidence[1]?.data as { requests: unknown[] }; assert.equal(network.requests.length, 1);
  assert.equal(evidence[2]?.source, "browser:console"); assert.equal(evidence[3]?.source, "browser:experience");
  const experience = evidence[3]?.data as { interactiveRequests: number }; assert.equal(experience.interactiveRequests, 1); assert.equal(closed, true);
});

test("controlled browser inspector closes sessions after navigation failure", async () => {
  let closed = false; const session: BrowserSession = { async navigate() { throw new Error("navigation failed"); }, async close() { closed = true; } };
  const inspector = new ControlledBrowserInspector({ createSession: async () => session, resolveImpl: publicResolver });
  await assert.rejects(() => inspector.inspect(new URL("https://example.com")), /navigation failed/); assert.equal(closed, true);
});

test("rejects redirects, non HTML responses and oversized documents", async () => {
  const redirect = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("", { status: 302 }) }); await assert.rejects(() => redirect.inspect(new URL("https://example.com")));
  const json = new PublicUrlInspector({ resolveImpl: publicResolver, fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }) }); await assert.rejects(() => json.inspect(new URL("https://example.com")), /not an HTML/);
  const huge = new PublicUrlInspector({ maxHtmlBytes: 4, resolveImpl: publicResolver, fetchImpl: async () => new Response("12345", { headers: { "content-type": "text/html" } }) }); await assert.rejects(() => huge.inspect(new URL("https://example.com")), /exceeds inspection budget/);
});
