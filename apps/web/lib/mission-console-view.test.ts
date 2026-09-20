import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent } from "@monstro/contracts";
import { deriveMissionConsoleView } from "./mission-console-view.ts";

const event = (phase: string, data?: MissionTransportEvent["data"]): MissionTransportEvent => ({
  id: `event-${phase}`,
  taskId: "task-1",
  type: phase === "build" ? "trace.updated" : "phase.changed",
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

test("derives pipeline, preview and history resume state", () => {
  const view = deriveMissionConsoleView({
    events: [event("understand"), event("build", { previewUrl: "/preview/task-1", progress: { build: [], repairs: [], evaluations: [] } })],
    history,
    restoreId: "task-1",
    missionDetail: null,
  });
  assert.equal(view.activeIndex, 3);
  assert.equal(view.previewUrl, "/preview/task-1");
  assert.equal(view.resumeLabel, "RESUME RUN");
  assert.equal(view.canResume, true);
  assert.ok(view.progress);
});

test("effective detail overrides stale history resume presentation", () => {
  const view = deriveMissionConsoleView({
    events: [], history, restoreId: "task-1",
    missionDetail: { taskId: "task-1", events: [], effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true } },
  });
  assert.equal(view.resumeLabel, "REBUILD FROM INSPECT");
  assert.equal(view.resumeReason, "workspace missing");
  assert.equal(view.canResume, true);
});

test("unselected cockpit is read only", () => {
  const view = deriveMissionConsoleView({ events: [], history, restoreId: "", missionDetail: null });
  assert.equal(view.activeIndex, -1);
  assert.equal(view.resumeLabel, "READ ONLY");
  assert.equal(view.canResume, false);
});
