import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan, MonstroTask } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "./index.js";

function task(phase: MonstroTask["phase"] = "build"): MonstroTask {
  return {
    id: "resume-fixture",
    intent: "resume safely",
    phase,
    context: { projectId: "resume-fixture", rootDir: ".", summary: "resume fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [{ id: "ok", description: "runtime accepted", required: true }],
    iteration: 0,
    maxIterations: 2,
  };
}

const plan: BuildPlan = {
  taskId: "resume-fixture",
  rationale: "persisted plan",
  requirements: [{ id: "acceptance:ok", description: "runtime accepted", source: "acceptance", required: true }],
  steps: [{ id: "build", title: "Build", description: "already applied", status: "done" }],
};

function services(calls: { build: number; apply: number; run: number }): MonstroServices {
  return {
    inspector: { async inspect() { return []; } },
    architect: { async plan() { return plan; } },
    builder: {
      async build() { calls.build += 1; return []; },
      async apply() { calls.apply += 1; },
    },
    runtime: { async run() { calls.run += 1; return { ok: true, previewUrl: "http://127.0.0.1/", stdout: "", stderr: "", durationMs: 1 }; } },
    observer: { async observe() { return { ok: true, durationMs: 1, evidence: [] }; } },
    evaluator: { async evaluate() { return { accepted: true, score: 1, findings: [], nextActions: [], evidenceTrace: [{ requirementId: "acceptance:ok", evidenceSources: ["runtime"] }] }; } },
    repairer: { async repair() { return []; } },
    exporter: { async deliver(current) { return { taskId: current.id, completedAt: "2026-09-19T00:00:00.000Z", summary: "resumed delivery", artifacts: [] }; } },
  };
}

test("resume from confirmed build starts at run without replaying build side effects", async () => {
  const persisted = new MissionJournal();
  const checkpoint = task("build");
  await persisted.record(checkpoint, "phase.changed", undefined, { task: structuredClone(checkpoint) });
  await persisted.record(checkpoint, "build.applied", "already applied", { plan: structuredClone(plan), requirementIds: ["acceptance:ok"] });
  await persisted.record(checkpoint, "trace.updated", "build traced", {
    progress: { build: [{ path: "preview.html", operation: "create", requirementIds: ["acceptance:ok"] }], repairs: [], evaluations: [] },
    snapshot: { buildPatches: [{ path: "preview.html", operation: "create", content: "ok", requirementIds: ["acceptance:ok"] }], repairPatches: [], evaluations: [] },
  });

  const calls = { build: 0, apply: 0, run: 0 };
  const resumedJournal = new MissionJournal();
  const delivery = await new MonstroOrchestrator(services(calls), resumedJournal).resume(persisted.snapshot());

  assert.equal(delivery.summary, "resumed delivery");
  assert.deepEqual(calls, { build: 0, apply: 0, run: 1 });
  assert.equal(delivery.trace?.requirements[0]?.buildPaths[0], "preview.html");
  assert.equal(resumedJournal.snapshot()[0]?.type, "mission.resumed");
  assert.equal(resumedJournal.snapshot().at(-1)?.type, "mission.completed");
});

test("resume rejects completed missions before invoking services", async () => {
  const persisted = new MissionJournal();
  const checkpoint = task("deliver");
  await persisted.record(checkpoint, "phase.changed", undefined, { task: structuredClone(checkpoint) });
  await persisted.record(checkpoint, "mission.completed", "done");
  const calls = { build: 0, apply: 0, run: 0 };

  await assert.rejects(
    () => new MonstroOrchestrator(services(calls)).resume(persisted.snapshot()),
    /already completed/,
  );
  assert.deepEqual(calls, { build: 0, apply: 0, run: 0 });
});
