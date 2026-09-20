import assert from "node:assert/strict";
import test from "node:test";
import { parseMissionDetailPayload } from "./mission-detail.ts";

test("parses effective resume decision from mission detail", () => {
  const detail = parseMissionDetailPayload({
    taskId: "mission-1",
    events: [],
    effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true },
  });
  assert.equal(detail.effectiveResume.restartPhase, "inspect");
  assert.equal(detail.effectiveResume.degraded, true);
});

test("rejects mission detail without effective resume contract", () => {
  assert.throws(() => parseMissionDetailPayload({ taskId: "mission-1", events: [] }), /invalid/);
});
