import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent, TaskPhase } from "@monstro/contracts";
import { deriveMissionConsoleView } from "./mission-console-view.ts";
import { replayMissionSnapshot } from "./mission-replay-snapshot.ts";

const event = (phase: TaskPhase, data?: MissionTransportEvent["data"], type?: MissionTransportEvent["type"]): MissionTransportEvent => ({
  id: `event-${phase}-${type ?? "phase"}`,
  taskId: "task-1",
  type: type ?? (phase === "build" ? "trace.updated" : "phase.changed"),
  phase,
  timestamp: "2026-09-20T12:00:00.000Z",
  data,
});

const history = [{
  taskId: "task-1",
  phase: "build",
  status: "build.applied",
  updatedAt: null,
  eventCount: 4,
  resumable: true,
  restartPhase: "run",
  resumeReason: "confirmed build checkpoint",
}];

test("derives pipeline, execution state, preview and history resume state", () => {
  const view = deriveMissionConsoleView({
    events: [event("understand"), event("build", { previewUrl: "/preview/task-1", progress: { build: [], repairs: [], evaluations: [] } })],
    history,
    restoreId: "task-1",
    missionDetail: null,
  });
  assert.equal(view.activeIndex, 3);
  assert.equal(view.activePhase, "build");
  assert.equal(view.executionState, "running");
  assert.equal(view.previewUrl, "/preview/task-1");
  assert.equal(view.resumeLabel, "RESUME RUN");
  assert.equal(view.canResume, true);
  assert.ok(view.progress);
});

test("derives completed and failed terminal execution states", () => {
  const completed = deriveMissionConsoleView({
    events: [event("deliver", undefined, "mission.completed")], history, restoreId: "task-1", missionDetail: null,
  });
  assert.equal(completed.executionState, "completed");
  assert.equal(completed.activePhase, "deliver");

  const failed = deriveMissionConsoleView({
    events: [event("failed", undefined, "mission.failed")], history, restoreId: "task-1", missionDetail: null,
  });
  assert.equal(failed.executionState, "failed");
  assert.equal(failed.activeIndex, -1);
  assert.equal(failed.activePhase, undefined);
});

test("effective detail and matching server snapshot override stale history", () => {
  const events = [event("build", { previewUrl: "/preview/restored" })];
  const snapshot = replayMissionSnapshot(events);
  const view = deriveMissionConsoleView({
    events, history, restoreId: "task-1",
    missionDetail: { taskId: "task-1", events, snapshot, effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true } },
  });
  assert.equal(view.resumeLabel, "REBUILD FROM INSPECT");
  assert.equal(view.resumeReason, "workspace missing");
  assert.equal(view.canResume, true);
  assert.equal(view.previewUrl, "/preview/restored");
  assert.equal(view.activePhase, "build");
});

test("falls back to replaying live events after a restored snapshot becomes stale", () => {
  const restoredEvents = [event("build")];
  const liveEvents = [...restoredEvents, event("run", { previewUrl: "/preview/live" }, "runtime.completed")];
  const view = deriveMissionConsoleView({
    events: liveEvents, history, restoreId: "task-1",
    missionDetail: { taskId: "task-1", events: restoredEvents, snapshot: replayMissionSnapshot(restoredEvents), effectiveResume: { resumable: true, restartPhase: "run", reason: "safe", degraded: false } },
  });
  assert.equal(view.activePhase, "run");
  assert.equal(view.previewUrl, "/preview/live");
});

test("unselected cockpit is idle and read only", () => {
  const view = deriveMissionConsoleView({ events: [], history, restoreId: "", missionDetail: null });
  assert.equal(view.activeIndex, -1);
  assert.equal(view.activePhase, undefined);
  assert.equal(view.executionState, "idle");
  assert.equal(view.resumeLabel, "READ ONLY");
  assert.equal(view.canResume, false);
});
