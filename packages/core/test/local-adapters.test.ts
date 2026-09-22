import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { createLocalExecutionAdapters } from "../src/index.js";

function task(): MonstroTask {
  return {
    id: "local-1",
    intent: "execute a generated artifact",
    phase: "build",
    context: { projectId: "local", rootDir: ".", summary: "adapter test", decisions: [] },
    requestedCapabilities: ["filesystem.write", "process.execute"],
    acceptance: [],
    iteration: 0,
    maxIterations: 1,
  };
}

test("builder patches the bounded workspace and runtime executes the artifact", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "monstro-core-"));
  try {
    const adapters = createLocalExecutionAdapters({
      baseDir,
      projectId: "project",
      process: { command: "node", args: ["artifact.mjs"] },
      policy: { allowedCommands: ["node"] },
      build: () => [{ path: "artifact.mjs", operation: "create", content: "console.log('MONSTRO_OK')" }],
    });
    const mission = task();
    const plan = { taskId: mission.id, rationale: "test", steps: [] };
    await adapters.builder.apply(mission, await adapters.builder.build(mission, plan));
    assert.match(await adapters.workspace.read("artifact.mjs"), /MONSTRO_OK/);

    const result = await adapters.runtime.run(mission);
    assert.equal(result.ok, true);
    assert.match(result.stdout, /MONSTRO_OK/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("runtime preserves the explicit command allowlist", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "monstro-core-"));
  try {
    const adapters = createLocalExecutionAdapters({
      baseDir,
      projectId: "project",
      process: { command: "not-authorized" },
      policy: { allowedCommands: ["node"] },
    });
    await assert.rejects(() => adapters.runtime.run(task()), /not allowed/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
