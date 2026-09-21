import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionConsoleStatus } from "./mission-console-status.ts";
import type { MissionConsoleView } from "./mission-console-view.ts";
import type { MissionExecutionState, MissionPipelinePhase } from "./mission-pipeline.ts";

function view(state: MissionExecutionState, phase?: MissionPipelinePhase): MissionConsoleView {
  return { operational: { state, phase, label: [state.toUpperCase(), phase?.toUpperCase()].filter(Boolean).join(" · ") }, pipeline: [], evidence: [], feed: [], resumeLabel: "READ ONLY", canResume: false };
}

test("idle transport presents journal execution state and phase", () => {
  const status = deriveMissionConsoleStatus({ operation: "idle", failure: null }, view("completed", "deliver"));
  assert.equal(status.label, "COMPLETED · DELIVER");
});

test("active transport operation is presented with journal state", () => {
  const status = deriveMissionConsoleStatus({ operation: "resuming", failure: null }, view("running", "run"));
  assert.equal(status.label, "RESUMING · RUNNING · RUN");
});

test("operation without journal events remains explicit", () => {
  const status = deriveMissionConsoleStatus({ operation: "restoring", failure: null }, view("idle"));
  assert.equal(status.label, "RESTORING · IDLE");
});

test("failure remains available independently from mission journal state", () => {
  const status = deriveMissionConsoleStatus({ operation: "idle", failure: "transport failed" }, view("failed"));
  assert.equal(status.label, "FAILED");
  assert.equal(status.failure, "transport failed");
});
