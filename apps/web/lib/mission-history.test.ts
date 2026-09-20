import assert from "node:assert/strict";
import test from "node:test";
import { formatMissionHistoryLabel, parseMissionHistoryPayload } from "./mission-history.ts";

const resumable = { resumable: true, restartPhase: "run", resumeReason: "confirmed build checkpoint" };
const readOnly = { resumable: false, restartPhase: null, resumeReason: "mission already completed" };

test("parses valid mission resume state and ignores malformed entries", () => {
  const missions = parseMissionHistoryPayload({ missions: [
    { taskId: "task-1", phase: "build", status: "build.applied", updatedAt: "2026-09-19T12:00:00.000Z", eventCount: 12, ...resumable },
    { taskId: "", phase: "build", status: null, updatedAt: null, eventCount: 2, ...resumable },
    { taskId: "task-2", phase: "deliver", status: "mission.completed", updatedAt: null, eventCount: 20, ...readOnly },
    { taskId: "task-legacy", phase: null, status: null, updatedAt: null, eventCount: 1 },
  ] });

  assert.deepEqual(missions.map((mission) => mission.taskId), ["task-1", "task-2"]);
  assert.equal(missions[0]?.resumable, true);
  assert.equal(missions[0]?.restartPhase, "run");
  assert.equal(missions[1]?.resumable, false);
});

test("rejects malformed history envelopes", () => {
  assert.throws(() => parseMissionHistoryPayload({}), /invalid/);
  assert.throws(() => parseMissionHistoryPayload({ missions: "nope" }), /invalid/);
});

test("formats resumable and read-only operator-facing labels", () => {
  const resumeLabel = formatMissionHistoryLabel({ taskId: "task-1", phase: "build", status: "build.applied", updatedAt: null, eventCount: 9, ...resumable });
  const readOnlyLabel = formatMissionHistoryLabel({ taskId: "task-2", phase: "deliver", status: "mission.completed", updatedAt: null, eventCount: 20, ...readOnly });
  assert.equal(resumeLabel, "RESUME RUN · BUILD · 9 events · unknown time · task-1");
  assert.equal(readOnlyLabel, "READ ONLY · DELIVER · 20 events · unknown time · task-2");
});
