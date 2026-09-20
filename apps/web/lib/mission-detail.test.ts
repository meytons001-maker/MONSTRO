import assert from "node:assert/strict";
import test from "node:test";
import { formatMissionResumeAction, parseMissionDetailPayload } from "./mission-detail.ts";

test("parses effective resume decision from mission detail", () => {
  const detail = parseMissionDetailPayload({ taskId: "mission-1", events: [], effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true } });
  assert.equal(detail.effectiveResume.restartPhase, "inspect");
  assert.equal(detail.effectiveResume.degraded, true);
});

test("rejects mission detail without effective resume contract", () => {
  assert.throws(() => parseMissionDetailPayload({ taskId: "mission-1", events: [] }), /invalid/);
});

test("formats effective resume actions consistently", () => {
  assert.equal(formatMissionResumeAction({ resumable: true, restartPhase: "run", degraded: false }), "RESUME RUN");
  assert.equal(formatMissionResumeAction({ resumable: true, restartPhase: "inspect", degraded: true }), "REBUILD FROM INSPECT");
  assert.equal(formatMissionResumeAction({ resumable: false, restartPhase: null, degraded: false }), "READ ONLY");
  assert.equal(formatMissionResumeAction(undefined), "READ ONLY");
});
