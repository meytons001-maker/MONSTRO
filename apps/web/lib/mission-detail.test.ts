import assert from "node:assert/strict";
import test from "node:test";
import { formatMissionResumeAction, parseMissionDetailPayload } from "./mission-detail.ts";
import { replayMissionSnapshot } from "./mission-replay-snapshot.ts";

const emptySnapshot = replayMissionSnapshot([]);

test("parses effective resume decision and replay snapshot from mission detail", () => {
  const detail = parseMissionDetailPayload({ taskId: "mission-1", events: [], snapshot: { ...emptySnapshot, taskId: "mission-1" }, effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true } });
  assert.equal(detail.effectiveResume.restartPhase, "inspect");
  assert.equal(detail.effectiveResume.degraded, true);
  assert.equal(detail.snapshot.executionState, "idle");
});

test("rejects mission detail without effective resume or replay snapshot contract", () => {
  assert.throws(() => parseMissionDetailPayload({ taskId: "mission-1", events: [] }), /invalid/);
  assert.throws(() => parseMissionDetailPayload({ taskId: "mission-1", events: [], effectiveResume: { resumable: false, restartPhase: null, reason: "done", degraded: false } }), /invalid/);
});

test("rejects a replay snapshot that does not match the restored journal", () => {
  assert.throws(() => parseMissionDetailPayload({ taskId: "mission-1", events: [], snapshot: { ...emptySnapshot, taskId: "other" }, effectiveResume: { resumable: false, restartPhase: null, reason: "done", degraded: false } }), /invalid/);
});

test("formats effective resume actions consistently", () => {
  assert.equal(formatMissionResumeAction({ resumable: true, restartPhase: "run", degraded: false }), "RESUME RUN");
  assert.equal(formatMissionResumeAction({ resumable: true, restartPhase: "inspect", degraded: true }), "REBUILD FROM INSPECT");
  assert.equal(formatMissionResumeAction({ resumable: false, restartPhase: null, degraded: false }), "READ ONLY");
  assert.equal(formatMissionResumeAction(undefined), "READ ONLY");
});
