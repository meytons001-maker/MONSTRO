import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan, Evaluation } from "@monstro/contracts";
import { MissionTraceCollector } from "./trace.js";

const plan: BuildPlan = { taskId: "trace", rationale: "fixture", requirements: [{ id: "acceptance:title", description: "title", source: "acceptance", required: true }], steps: [] };
const failed: Evaluation = { accepted: false, score: 0, evidenceTrace: [], findings: [{ code: "document.title", message: "bad", severity: "error", evidenceSource: "document.title", requirementIds: ["acceptance:title"] }], nextActions: [{ id: "fix-title", findingCode: "document.title", description: "fix", requirementIds: ["acceptance:title"] }] };
const passed: Evaluation = { accepted: true, score: 1, evidenceTrace: [{ requirementId: "acceptance:title", evidenceSources: ["document.title"] }], findings: [], nextActions: [] };

test("collector aggregates immutable build, repair and evaluation provenance", () => {
  const collector = new MissionTraceCollector();
  const ids = ["acceptance:title"];
  collector.recordBuild([{ path: "preview.html", operation: "create", content: "bad", requirementIds: ids }]);
  collector.recordEvaluation(1, failed);
  collector.recordRepair([{ path: "preview.html", operation: "update", content: "ok", requirementIds: ids }]);
  collector.recordEvaluation(2, passed);
  ids.push("mutated-after-record");

  const trace = collector.build(plan, passed);
  assert.deepEqual(trace.requirements, [{ requirementId: "acceptance:title", buildPaths: ["preview.html"], repairPaths: ["preview.html"], evidenceSources: ["document.title"], findingCodes: ["document.title"], status: "satisfied" }]);
  assert.deepEqual(trace.evaluations?.map((item) => ({ iteration: item.iteration, accepted: item.accepted, repairActionIds: item.repairActionIds })), [{ iteration: 1, accepted: false, repairActionIds: ["fix-title"] }, { iteration: 2, accepted: true, repairActionIds: [] }]);
});

test("snapshot exposes current trace state without leaking mutable collector state", () => {
  const collector = new MissionTraceCollector();
  collector.recordBuild([{ path: "preview.html", operation: "create", content: "bad", requirementIds: ["acceptance:title"] }]);
  collector.recordEvaluation(1, failed);

  const snapshot = collector.snapshot();
  snapshot.buildPatches[0]!.requirementIds!.push("external-mutation");
  snapshot.evaluations[0]!.repairActionIds.push("external-action");

  const fresh = collector.snapshot();
  assert.deepEqual(fresh.buildPatches[0]?.requirementIds, ["acceptance:title"]);
  assert.deepEqual(fresh.evaluations[0]?.repairActionIds, ["fix-title"]);
});
