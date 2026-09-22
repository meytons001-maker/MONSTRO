import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalSandboxRuntime, ProjectWorkspace } from "../src/index.js";

async function fixture(run: (workspace: ProjectWorkspace) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try { await run(new ProjectWorkspace(base, "mission")); }
  finally { await rm(base, { recursive: true, force: true }); }
}

test("workspace applies and reads patches inside its root", async () => fixture(async (workspace) => {
  await workspace.apply([{ path: "src/index.js", operation: "create", content: "console.log('MONSTRO_OK')" }]);
  assert.match(await workspace.read("src/index.js"), /MONSTRO_OK/);
}));

test("workspace rejects traversal and absolute paths", async () => fixture(async (workspace) => {
  await assert.rejects(() => workspace.apply([{ path: "../escape.txt", operation: "create", content: "no" }]));
  await assert.rejects(() => workspace.apply([{ path: "/tmp/escape.txt", operation: "create", content: "no" }]));
}));

test("runtime executes an allowlisted process and captures evidence", async () => fixture(async (workspace) => {
  await workspace.apply([{ path: "index.js", operation: "create", content: "console.log('MONSTRO_RUNTIME_OK')" }]);
  const result = await new LocalSandboxRuntime(workspace).run({ command: "node", args: ["index.js"] });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /MONSTRO_RUNTIME_OK/);
  assert.equal(result.stderr, "");
  assert.ok(result.durationMs >= 0);
}));

test("runtime refuses commands outside the explicit allowlist", async () => fixture(async (workspace) => {
  const runtime = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"] });
  await assert.rejects(() => runtime.run({ command: "sh", args: ["-c", "echo nope"] }), /not allowed/);
}));

test("runtime terminates work that exceeds its timeout", async () => fixture(async (workspace) => {
  await workspace.apply([{ path: "slow.js", operation: "create", content: "setTimeout(() => {}, 5000)" }]);
  const result = await new LocalSandboxRuntime(workspace, { maxTimeoutMs: 500 }).run({ command: "node", args: ["slow.js"], timeoutMs: 150 });
  assert.equal(result.ok, false);
  assert.match(result.stderr, /timed out/);
}));
