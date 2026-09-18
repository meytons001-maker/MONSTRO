import assert from "node:assert/strict";
import test from "node:test";
import type { Evidence, FilePatch, MonstroTask } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "./index.js";

function task(): MonstroTask {
  return {
    id: "repair-loop",
    intent: "build a valid preview",
    phase: "understand",
    context: { projectId: "repair-loop", rootDir: ".", summary: "repair loop fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [{ id: "title", description: "preview title is valid", required: true }],
    iteration: 0,
    maxIterations: 2,
  };
}

test("orchestrator repairs a failed observation and delivers on the next iteration", async () => {
  let artifact = "BROKEN";
  const applied: FilePatch[] = [];
  const evaluatedEvidence: Evidence[][] = [];
  const journal = new MissionJournal();

  const services: MonstroServices = {
    inspector: { async inspect() { return [{ source: "reference:experience", kind: "visual", summary: "fixture reference profile", data: { canvasCount: 1 } }]; } },
    architect: { async plan(current) { return { taskId: current.id, rationale: "test repair loop", requirements: [{ id: "acceptance:title", description: "preview title is valid", source: "acceptance", required: true }], steps: [{ id: "build", title: "Build", description: "fixture", status: "pending" }] }; } },
    builder: {
      async build() { return [{ path: "preview.html", operation: "create", content: artifact, requirementIds: ["acceptance:title"] }]; },
      async apply(_current, patches) {
        applied.push(...patches);
        const patch = patches.find((candidate) => candidate.path === "preview.html");
        if (patch?.content) artifact = patch.content;
      },
    },
    runtime: { async run() { return { ok: true, previewUrl: "http://127.0.0.1/", stdout: "", stderr: "", durationMs: 1 }; } },
    observer: { async observe() { return { ok: true, durationMs: 1, evidence: [{ source: "document.title", kind: "runtime", summary: artifact, requirementIds: artifact === "MONSTRO Preview" ? ["acceptance:title"] : [] }] }; } },
    evaluator: {
      async evaluate(_current, _runtime, evidence) {
        evaluatedEvidence.push(evidence);
        const valid = evidence.some((item) => item.source === "document.title" && item.summary === "MONSTRO Preview");
        return valid
          ? { accepted: true, score: 1, findings: [], nextActions: [] }
          : { accepted: false, score: 0, findings: [{ code: "document.title", message: "invalid title", severity: "error", evidenceSource: "document.title", requirementIds: ["acceptance:title"] }], nextActions: [{ id: "fix-title", findingCode: "document.title", description: "repair title", targetPath: "preview.html", requirementIds: ["acceptance:title"] }] };
      },
    },
    repairer: { async repair() { return [{ path: "preview.html", operation: "update", content: "MONSTRO Preview", requirementIds: ["acceptance:title"] }]; } },
    exporter: { async deliver(current) { return { taskId: current.id, completedAt: "2026-09-16T00:00:00.000Z", summary: "delivered after repair", artifacts: ["preview.html"] }; } },
  };

  const current = task();
  const delivery = await new MonstroOrchestrator(services, journal).execute(current);
  const events = journal.snapshot();

  assert.equal(delivery.summary, "delivered after repair");
  assert.deepEqual(delivery.trace?.requirements, [{ requirementId: "acceptance:title", buildPaths: ["preview.html"], repairPaths: ["preview.html"], evidenceSources: ["document.title"], findingCodes: [], status: "satisfied" }]);
  assert.equal(current.iteration, 2);
  assert.equal(artifact, "MONSTRO Preview");
  assert.equal(applied.length, 2);
  assert.equal(evaluatedEvidence.length, 2);
  assert.ok(evaluatedEvidence.every((items) => items.some((item) => item.source === "reference:experience")));
  assert.ok(evaluatedEvidence.every((items) => items.some((item) => item.source === "document.title")));
  const buildEvent = events.find((event) => event.type === "build.applied");
  const repairEvent = events.find((event) => event.type === "repair.completed");
  assert.deepEqual(buildEvent?.data?.requirementIds, ["acceptance:title"]);
  assert.deepEqual(repairEvent?.data?.requirementIds, ["acceptance:title"]);
  assert.equal(events.filter((event) => event.type === "iteration.started").length, 2);
  assert.equal(events.filter((event) => event.type === "repair.completed").length, 1);
  assert.equal(events.at(-1)?.type, "mission.completed");
});
