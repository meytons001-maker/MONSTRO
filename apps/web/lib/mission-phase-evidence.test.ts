import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent, TaskPhase } from "@monstro/contracts";
import { deriveMissionPhaseEvidence } from "./mission-phase-evidence.ts";

function event(id: string, type: MissionTransportEvent["type"], phase: TaskPhase, data?: MissionTransportEvent["data"], detail?: string): MissionTransportEvent {
  return { id, taskId: "mission-evidence", type, phase, timestamp: `2026-09-20T00:00:0${id}.000Z`, data, detail };
}

test("derives plan, build, evaluation and repair evidence from journal events", () => {
  const events: MissionTransportEvent[] = [
    event("1", "phase.changed", "understand"),
    event("2", "phase.changed", "plan"),
    event("3", "build.applied", "build", { plan: { taskId: "mission-evidence", rationale: "Ship a verified preview", requirements: [{ id: "r1", description: "preview", source: "understanding", required: true }], steps: [{ id: "s1", title: "Build", description: "create preview", status: "done" }] } }),
    event("4", "trace.updated", "evaluate", { progress: { build: [{ path: "index.html", operation: "create", requirementIds: ["r1"] }], repairs: [], evaluations: [{ iteration: 1, accepted: false, score: 72, requirementIds: ["r1"], findingCodes: ["document.heading"], repairActionIds: ["fix-heading"] }] } }),
    event("5", "repair.completed", "repair", { requirementIds: ["r1"] }),
    event("6", "trace.updated", "repair", { progress: { build: [{ path: "index.html", operation: "create", requirementIds: ["r1"] }], repairs: [{ path: "index.html", operation: "update", requirementIds: ["r1"] }], evaluations: [{ iteration: 1, accepted: false, score: 72, requirementIds: ["r1"], findingCodes: ["document.heading"], repairActionIds: ["fix-heading"] }] } }),
  ];

  const evidence = deriveMissionPhaseEvidence(events);
  assert.equal(evidence.find((item) => item.phase === "plan")?.summary, "Ship a verified preview");
  assert.deepEqual(evidence.find((item) => item.phase === "plan")?.metrics, ["1 step(s)", "1 requirement(s)"]);
  assert.deepEqual(evidence.find((item) => item.phase === "build")?.metrics, ["1 patch(es)"]);
  assert.deepEqual(evidence.find((item) => item.phase === "evaluate")?.metrics, ["score 72", "1 finding(s)", "iteration 1"]);
  assert.equal(evidence.find((item) => item.phase === "repair")?.status, "active");
  assert.deepEqual(evidence.find((item) => item.phase === "repair")?.metrics, ["1 patch(es)"]);
});

test("derives explicit inspection and runtime evidence", () => {
  const events = [
    event("1", "phase.changed", "understand", undefined, "Build an interactive preview"),
    event("2", "phase.changed", "inspect"),
    event("3", "inspection.completed", "inspect", { evidenceCount: 4, evidenceSources: ["project", "reference"], evidenceKinds: ["code", "visual"] }, "4 evidence item(s) inspected"),
    event("4", "phase.changed", "run"),
    event("5", "runtime.completed", "run", { ok: true, durationMs: 37, previewUrl: "http://127.0.0.1:3000" }, "runtime completed in 37ms"),
  ];
  const evidence = deriveMissionPhaseEvidence(events);
  assert.equal(evidence.find((item) => item.phase === "understand")?.summary, "Build an interactive preview");
  assert.equal(evidence.find((item) => item.phase === "inspect")?.summary, "4 evidence item(s) inspected");
  assert.deepEqual(evidence.find((item) => item.phase === "inspect")?.metrics, ["4 evidence", "2 source(s)", "2 kind(s)"]);
  assert.equal(evidence.find((item) => item.phase === "run")?.summary, "runtime completed in 37ms");
  assert.deepEqual(evidence.find((item) => item.phase === "run")?.metrics, ["ok", "37ms", "preview ready"]);
});

test("derives observation and delivery summaries", () => {
  const events = [
    event("1", "phase.changed", "observe"),
    event("2", "observation.completed", "observe", { evidenceCount: 3, durationMs: 12 }, "3 evidence item(s) observed"),
    event("3", "phase.changed", "deliver"),
    event("4", "mission.completed", "deliver", { artifacts: ["index.html", "preview.png"] }, "Mission delivered"),
  ];
  const evidence = deriveMissionPhaseEvidence(events);
  assert.equal(evidence.find((item) => item.phase === "observe")?.summary, "3 evidence item(s) observed");
  assert.deepEqual(evidence.find((item) => item.phase === "observe")?.metrics, ["3 evidence", "12ms"]);
  assert.equal(evidence.find((item) => item.phase === "deliver")?.summary, "Mission delivered");
  assert.deepEqual(evidence.find((item) => item.phase === "deliver")?.metrics, ["2 artifact(s)"]);
});

test("returns waiting evidence for an empty mission", () => {
  const evidence = deriveMissionPhaseEvidence([]);
  assert.equal(evidence.length, 9);
  assert.ok(evidence.every((item) => item.status === "waiting"));
  assert.equal(evidence[0]?.summary, "Waiting for mission intent.");
});
