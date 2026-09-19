import assert from "node:assert/strict";
import test from "node:test";
import { formatMissionHistoryLabel, parseMissionHistoryPayload } from "./mission-history.ts";

test("parses valid resumable missions and ignores malformed entries", () => {
  const missions = parseMissionHistoryPayload({ missions: [
    { taskId: "task-1", phase: "deliver", status: "mission.completed", updatedAt: "2026-09-19T12:00:00.000Z", eventCount: 12 },
    { taskId: "", phase: "build", status: null, updatedAt: null, eventCount: 2 },
    { taskId: "task-2", phase: null, status: null, updatedAt: null, eventCount: 1 },
  ] });

  assert.deepEqual(missions.map((mission) => mission.taskId), ["task-1", "task-2"]);
});

test("rejects malformed history envelopes", () => {
  assert.throws(() => parseMissionHistoryPayload({}), /invalid/);
  assert.throws(() => parseMissionHistoryPayload({ missions: "nope" }), /invalid/);
});

test("formats a compact operator-facing mission label", () => {
  const label = formatMissionHistoryLabel({ taskId: "task-1", phase: "repair", status: "trace.updated", updatedAt: null, eventCount: 9 });
  assert.equal(label, "REPAIR · 9 events · unknown time · task-1");
});
