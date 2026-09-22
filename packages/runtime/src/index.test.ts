import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalSandboxRuntime, ProjectWorkspace } from "./index.js";

test("workspace applies patches without allowing path escape and supports cleanup", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { const workspace = new ProjectWorkspace(base, "mission-a"); await workspace.apply([{ path: "src/index.js", operation: "create", content: "console.log('MONSTRO_OK')" }]); assert.match(await workspace.read("src/index.js"), /MONSTRO_OK/); await assert.rejects(() => workspace.apply([{ path: "../escape.txt", operation: "create", content: "no" }])); await workspace.cleanup(); await assert.rejects(() => access(workspace.root)); } finally { await rm(base, { recursive: true, force: true }); }
});

test("runtime executes allowlisted node process and captures output", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { const workspace = new ProjectWorkspace(base, "mission-b"); await workspace.apply([{ path: "index.js", operation: "create", content: "console.log('MONSTRO_RUNTIME_OK')" }]); const runtime = new LocalSandboxRuntime(workspace); const result = await runtime.run({ command: "node", args: ["index.js"], timeoutMs: 2_000 }); assert.equal(result.ok, true); assert.match(result.stdout, /MONSTRO_RUNTIME_OK/); await assert.rejects(() => runtime.run({ command: "sh", args: ["-c", "echo nope"] })); } finally { await rm(base, { recursive: true, force: true }); }
});

test("runtime enforces project command policy", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { const workspace = new ProjectWorkspace(base, "mission-policy"); await workspace.init(); const runtime = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"] }); await assert.rejects(() => runtime.run({ command: "pnpm", args: ["--version"] }), /not allowed/); } finally { await rm(base, { recursive: true, force: true }); }
});

test("runtime terminates processes that exceed timeout", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { const workspace = new ProjectWorkspace(base, "mission-timeout"); await workspace.apply([{ path: "slow.js", operation: "create", content: "setTimeout(() => {}, 5000)" }]); const runtime = new LocalSandboxRuntime(workspace, { maxTimeoutMs: 500 }); const result = await runtime.run({ command: "node", args: ["slow.js"], timeoutMs: 150 }); assert.equal(result.ok, false); assert.match(result.stderr, /timed out/); } finally { await rm(base, { recursive: true, force: true }); }
});

test("runtime bounds combined stdout and stderr", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { const workspace = new ProjectWorkspace(base, "mission-output"); await workspace.apply([{ path: "loud.js", operation: "create", content: "process.stdout.write('x'.repeat(8192)); setTimeout(() => {}, 5000)" }]); const runtime = new LocalSandboxRuntime(workspace, { maxOutputBytes: 2048 }); const result = await runtime.run({ command: "node", args: ["loud.js"] }); assert.equal(result.ok, false); assert.ok(Buffer.byteLength(result.stdout) <= 2048); assert.match(result.stderr, /output exceeded/); } finally { await rm(base, { recursive: true, force: true }); }
});

test("preview starts on loopback, becomes healthy and can be stopped", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-preview-"));
  try {
    const workspace = new ProjectWorkspace(base, "mission-preview");
    await workspace.apply([{ path: "server.js", operation: "create", content: "const http=require('node:http'); const args=process.argv; const port=Number(args[args.indexOf('--port')+1]); const host=args[args.indexOf('--host')+1]; http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('MONSTRO_PREVIEW_OK')}).listen(port,host);" }]);
    const runtime = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"], maxTimeoutMs: 3_000 });
    const preview = await runtime.startPreview({ command: "node", args: ["server.js"], startupTimeoutMs: 2_000 });
    assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(preview.url);
    assert.equal(await response.text(), "MONSTRO_PREVIEW_OK");
    await preview.stop();
    await assert.rejects(() => fetch(preview.url, { signal: AbortSignal.timeout(300) }));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("preview rejects non-loopback binding", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-preview-"));
  try { const workspace = new ProjectWorkspace(base, "mission-preview-policy"); await workspace.init(); const runtime = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"] }); await assert.rejects(() => runtime.startPreview({ command: "node", args: ["server.js"], host: "0.0.0.0" }), /not allowed/); } finally { await rm(base, { recursive: true, force: true }); }
});
