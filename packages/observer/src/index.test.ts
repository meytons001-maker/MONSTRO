import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { HttpPreviewObserver } from "./index.js";

async function serve(body: string) {
  const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(body); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function evidenceData(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "expected structured evidence data");
  return value as Record<string, unknown>;
}

test("observes document metadata and DOM structure as structured evidence", async () => {
  const fixture = await serve("<!doctype html><html><head><title>MONSTRO Preview</title><style>body{margin:0}</style></head><body><main><h1>MONSTRO <span>LIVE</span> PREVIEW</h1><a href='/docs'>Docs</a><img src='/mark.png'></main><script>void 0</script></body></html>");
  try {
    const result = await new HttpPreviewObserver().observe(fixture.url, { ok: true, stdout: "", stderr: "", durationMs: 1 });
    assert.equal(result.ok, true);
    const document = result.evidence.find((item) => item.source === "preview:document");
    assert.ok(document, "expected preview:document evidence");
    const data = evidenceData(document.data);
    assert.deepEqual({ title: data.title, h1: data.h1 }, { title: "MONSTRO Preview", h1: "MONSTRO LIVE PREVIEW" });

    const domEvidence = result.evidence.find((item) => item.source === "preview:dom");
    assert.ok(domEvidence, "expected preview:dom evidence");
    const dom = evidenceData(domEvidence.data);
    assert.deepEqual(
      { html: dom.html, head: dom.head, body: dom.body, main: dom.main, headings: dom.headings, links: dom.links, images: dom.images, scripts: dom.scripts, styles: dom.styles, canvas: dom.canvas },
      { html: 1, head: 1, body: 1, main: 1, headings: 1, links: 1, images: 1, scripts: 1, styles: 1, canvas: 0 },
    );
  } finally { await fixture.close(); }
});

test("profiles interactive signals in the produced preview", async () => {
  const fixture = await serve("<!doctype html><html><body><canvas></canvas><script src='https://cdn.example/three.min.js'></script><a href='/scene.glb'>scene</a></body></html>");
  try {
    const result = await new HttpPreviewObserver().observe(fixture.url, { ok: true, stdout: "", stderr: "", durationMs: 1 });
    const experience = result.evidence.find((item) => item.source === "preview:experience");
    assert.ok(experience, "expected preview:experience evidence");
    const data = evidenceData(experience.data);
    assert.equal(data.canvasCount, 1);
    assert.equal(data.interactiveAssets, 1);
    assert.deepEqual(data.technologies, ["three.js"]);
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
