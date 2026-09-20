import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { resolveEffectiveMissionResume } from "./mission-resume-decision.ts";

function task(rootDir: string, id = "resume-decision"): MonstroTask {
  return {
    id,
    intent: "resume decision fixture",
    phase: "build",
    context: { projectId: id, rootDir, summary: "fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

test("keeps direct run when persisted effects are physically available", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "monstro-resume-decision-"));
  const current = task(rootDir);
  try {
    const workspace = join(rootDir, current.context.projectId);
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "preview.mjs"), "export {};\n", "utf8");
    const decision = await resolveEffectiveMissionResume({ resumable: true, restartPhase: "run", reason: "confirmed build", task: current });
    assert.equal(decision.restartPhase, "run");
    assert.equal(decision.reason, "confirmed build");
    assert.equal(decision.degraded, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("degrades run to inspect when persisted effects are unavailable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "monstro-resume-decision-"));
  const current = task(rootDir);
  try {
    const decision = await resolveEffectiveMissionResume({ resumable: true, restartPhase: "run", reason: "confirmed build", task: current });
    assert.equal(decision.restartPhase, "inspect");
    assert.equal(decision.degraded, true);
    assert.match(decision.reason, /rebuilding conservatively from inspect/i);
    assert.match(decision.reason, /workspace is unavailable/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("preserves read-only decisions without requiring workspace state", async () => {
  const decision = await resolveEffectiveMissionResume({ resumable: false, restartPhase: null, reason: "mission already completed", task: null });
  assert.equal(decision.resumable, false);
  assert.equal(decision.restartPhase, null);
  assert.equal(decision.reason, "mission already completed");
  assert.equal(decision.degraded, false);
});
