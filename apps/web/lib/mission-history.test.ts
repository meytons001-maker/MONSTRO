import assert from "node:assert/strict";
import test from "node:test";
import { formatMissionHistoryLabel, formatMissionResumeAction, parseMissionHistoryPayload } from "./mission-history.ts";

const resumable = { resumable: true, restartPhase: "run", resumeReason: "confirmed build checkpoint" };
const rebuild = { resumable: true, restartPhase: "inspect", resumeReason: "workspace unavailable; rebuilding conservatively" };
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

test("formats direct resume, conservative rebuild and read-only actions", () => {
  const direct = { taskId: "task-1", phase: "build", status: "build.applied", updatedAt: null, eventCount: 9, ...resumable };
  const conservative = { taskId: "task-3", phase: "build", status: "build.applied", updatedAt: null, eventCount: 11, ...rebuild };
  const completed = { taskId: "task-2", phase: "deliver", status: "mission.completed", updatedAt: null, eventCount: 20, ...readOnly };

  assert.equal(formatMissionResumeAction(direct), "RESUME RUN");
  assert.equal(formatMissionResumeAction(conservative), "REBUILD FROM INSPECT");
  assert.equal(formatMissionResumeAction(completed), "READ ONLY");
  assert.equal(formatMissionHistoryLabel(direct), "RESUME RUN · BUILD · 9 events · unknown time · task-1");
  assert.equal(formatMissionHistoryLabel(conservative), "REBUILD FROM INSPECT · BUILD · 11 events · unknown time · task-3");
  assert.equal(formatMissionHistoryLabel(completed), "READ ONLY · DELIVER · 20 events · unknown time · task-2");
});
