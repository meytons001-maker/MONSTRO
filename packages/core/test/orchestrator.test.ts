import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { CapabilityDeniedError, MonstroOrchestrator, PolicyAuthorizer } from "../src/index.js";

function task(): MonstroTask {
  return {
    id: "mission-1",
    intent: "build a validated module",
    phase: "understand",
    context: { projectId: "monstro", rootDir: ".", summary: "test", decisions: [] },
    requestedCapabilities: ["filesystem.read", "filesystem.write", "process.execute"],
    acceptance: [{ id: "works", description: "runtime passes", required: true }],
    iteration: 0,
    maxIterations: 3,
  };
}

test("runs build -> evaluate -> repair until accepted", async () => {
  const mission = task();
  let runs = 0;
  let repairs = 0;
  let applies = 0;
  const orchestrator = new MonstroOrchestrator({
    authorizer: new PolicyAuthorizer(),
    inspector: { inspect: async () => [{ source: "repo", kind: "code", summary: "inspected" }] },
    architect: { plan: async (t) => ({ taskId: t.id, rationale: "test", steps: [] }) },
    builder: {
      build: async () => [{ path: "feature.ts", operation: "create", content: "export {};" }],
      apply: async () => { applies += 1; },
    },
    runtime: {
      run: async () => {
        runs += 1;
        return { ok: runs > 1, stdout: "", stderr: runs > 1 ? "" : "failed", durationMs: 1 };
      },
    },
    evaluator: {
      evaluate: async (_t, runtime) => ({ accepted: runtime.ok, score: runtime.ok ? 1 : 0, findings: [], nextActions: [] }),
    },
    repairer: {
      repair: async () => {
        repairs += 1;
        return [{ path: "feature.ts", operation: "update", content: "export const fixed = true;" }];
      },
    },
    exporter: {
      deliver: async (t) => ({ taskId: t.id, completedAt: "2026-09-22T00:00:00Z", summary: "done", artifacts: ["feature.ts"] }),
    },
  });

  const delivery = await orchestrator.execute(mission);
  assert.equal(delivery.summary, "done");
  assert.equal(mission.phase, "deliver");
  assert.equal(mission.iteration, 2);
  assert.equal(runs, 2);
  assert.equal(repairs, 1);
  assert.equal(applies, 2);
});

test("stops before inspection when a capability is denied", async () => {
  const mission = task();
  mission.requestedCapabilities = ["filesystem.read"];
  let inspected = false;
  const orchestrator = new MonstroOrchestrator({
    authorizer: { authorize: () => ({ allowed: [], denied: ["filesystem.read"], reasons: ["test denial"] }) },
    inspector: { inspect: async () => { inspected = true; return []; } },
    architect: { plan: async (t) => ({ taskId: t.id, rationale: "", steps: [] }) },
    builder: { build: async () => [], apply: async () => {} },
    runtime: { run: async () => ({ ok: true, stdout: "", stderr: "", durationMs: 0 }) },
    evaluator: { evaluate: async () => ({ accepted: true, score: 1, findings: [], nextActions: [] }) },
    repairer: { repair: async () => [] },
    exporter: { deliver: async (t) => ({ taskId: t.id, completedAt: "", summary: "", artifacts: [] }) },
  });

  await assert.rejects(() => orchestrator.execute(mission), CapabilityDeniedError);
  assert.equal(inspected, false);
  assert.equal(mission.phase, "failed");
});
