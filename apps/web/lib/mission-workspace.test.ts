import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { checkMissionWorkspaceForRun } from "./mission-workspace.ts";

function task(rootDir: string, projectId = "workspace-fixture"): MonstroTask {
  return {
    id: projectId,
    intent: "workspace readiness fixture",
    phase: "run",
    context: { projectId, rootDir, summary: "fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "monstro-workspace-check-"));
  try { await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("run resume is ready only when preview.mjs exists in the mission workspace", async () => {
  await withRoot(async (root) => {
    const current = task(root);
    const workspace = join(root, current.context.projectId);
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "preview.mjs"), "export {};\n", "utf8");

    const result = await checkMissionWorkspaceForRun(current);
    assert.equal(result.ready, true);
  });
});

test("run resume is rejected when the persisted workspace disappeared", async () => {
  await withRoot(async (root) => {
    const result = await checkMissionWorkspaceForRun(task(root));
    assert.equal(result.ready, false);
    assert.match(result.reason, /Workspace is unavailable/);
  });
});

test("run resume rejects a preview symlink that escapes the mission workspace", async () => {
  await withRoot(async (root) => {
    const current = task(root);
    const workspace = join(root, current.context.projectId);
    const outside = join(root, "outside-preview.mjs");
    await mkdir(workspace, { recursive: true });
    await writeFile(outside, "export {};\n", "utf8");
    await symlink(outside, join(workspace, "preview.mjs"));

    const result = await checkMissionWorkspaceForRun(current);
    assert.equal(result.ready, false);
    assert.match(result.reason, /outside the mission workspace/);
  });
});
