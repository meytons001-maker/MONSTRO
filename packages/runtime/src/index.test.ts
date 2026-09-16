import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalSandboxRuntime, ProjectWorkspace } from "./index.js";

test("workspace applies patches without allowing path escape", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try {
    const workspace = new ProjectWorkspace(base, "mission-a");
    await workspace.apply([{ path: "src/index.js", operation: "create", content: "console.log('MONSTRO_OK')" }]);
    assert.match(await workspace.read("src/index.js"), /MONSTRO_OK/);
    await assert.rejects(() => workspace.apply([{ path: "../escape.txt", operation: "create", content: "no" }]));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("runtime executes allowlisted node process and captures output", async () => {
  const base = await mkdtemp(join(tmpdir(), "monstro-runtime-"));
  try {
    const workspace = new ProjectWorkspace(base, "mission-b");
    await workspace.apply([{ path: "index.js", operation: "create", content: "console.log('MONSTRO_RUNTIME_OK')" }]);
    const runtime = new LocalSandboxRuntime(workspace);
    const result = await runtime.run({ command: "node", args: ["index.js"], timeoutMs: 2_000 });
    assert.equal(result.ok, true);
    assert.match(result.stdout, /MONSTRO_RUNTIME_OK/);
    await assert.rejects(() => runtime.run({ command: "sh", args: ["-c", "echo nope"] }));
  } finally { await rm(base, { recursive: true, force: true }); }
});
