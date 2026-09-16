import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { HttpPreviewObserver } from "./index";

async function serve(body: string) {
  const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(body); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

test("observes document metadata as structured evidence", async () => {
  const fixture = await serve("<!doctype html><title>MONSTRO Preview</title><h1>MONSTRO LIVE PREVIEW</h1>");
  try {
    const result = await new HttpPreviewObserver().observe(fixture.url, { ok: true, stdout: "", stderr: "", durationMs: 1 });
    assert.equal(result.ok, true);
    const document = result.evidence.find((item) => item.source === "preview:document");
    assert.deepEqual(document?.data && { title: document.data.title, h1: document.data.h1 }, { title: "MONSTRO Preview", h1: "MONSTRO LIVE PREVIEW" });
  } finally { await fixture.close(); }
});

test("rejects documents larger than configured observation budget", async () => {
  const fixture = await serve(`<title>x</title>${"a".repeat(200)}`);
  try {
    const result = await new HttpPreviewObserver({ maxHtmlBytes: 32 }).observe(fixture.url, { ok: true, stdout: "", stderr: "", durationMs: 1 });
    assert.equal(result.ok, false);
    assert.match(result.evidence.at(-1)?.summary ?? "", /exceeded observation limit/);
  } finally { await fixture.close(); }
});
