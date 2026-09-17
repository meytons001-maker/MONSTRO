import assert from "node:assert/strict";
import test from "node:test";
import { PublicUrlInspector, extractPublicHttpUrl } from "./index.ts";

test("extracts public HTTP references and rejects local/private targets", () => {
  assert.equal(extractPublicHttpUrl("analyze https://example.com/demo")?.hostname, "example.com");
  assert.equal(extractPublicHttpUrl("analyze http://127.0.0.1:3000"), undefined);
  assert.equal(extractPublicHttpUrl("analyze http://192.168.1.2"), undefined);
  assert.equal(extractPublicHttpUrl("analyze https://user:pass@example.com"), undefined);
});

test("produces bounded document and network evidence", async () => {
  const inspector = new PublicUrlInspector({ fetchImpl: async () => new Response("<!doctype html><title>Reference</title><h1>World</h1><script></script><img src='x'>", { status: 200, headers: { "content-type": "text/html" } }) });
  const evidence = await inspector.inspect(new URL("https://example.com"));
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0]?.source, "reference:http");
  assert.deepEqual(evidence[1]?.data, { title: "Reference", h1: "World", scripts: 1, styles: 0, images: 1 });
});

test("rejects redirects, non HTML responses and oversized documents", async () => {
  const redirect = new PublicUrlInspector({ fetchImpl: async () => new Response("", { status: 302 }) });
  await assert.rejects(() => redirect.inspect(new URL("https://example.com")));
  const json = new PublicUrlInspector({ fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }) });
  await assert.rejects(() => json.inspect(new URL("https://example.com")), /not an HTML/);
  const huge = new PublicUrlInspector({ maxHtmlBytes: 4, fetchImpl: async () => new Response("12345", { headers: { "content-type": "text/html" } }) });
  await assert.rejects(() => huge.inspect(new URL("https://example.com")), /exceeds inspection budget/);
});
