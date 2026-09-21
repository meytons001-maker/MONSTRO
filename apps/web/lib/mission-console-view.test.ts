import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent, TaskPhase } from "@monstro/contracts";
import { deriveMissionConsoleView } from "./mission-console-view.ts";
import { replayMissionSnapshot } from "./mission-replay-snapshot.ts";

const event = (phase: TaskPhase, data?: MissionTransportEvent["data"], type?: MissionTransportEvent["type"]): MissionTransportEvent => ({
  id: `event-${phase}-${type ?? "phase"}`, taskId: "task-1", type: type ?? (phase === "build" ? "trace.updated" : "phase.changed"), phase, timestamp: "2026-09-20T12:00:00.000Z", data,
});
const history = [{ taskId: "task-1", phase: "build", status: "build.applied", updatedAt: null, eventCount: 4, resumable: true, restartPhase: "run", resumeReason: "confirmed build checkpoint" }];

test("derives operational state, pipeline, preview and history resume state", () => {
  const view = deriveMissionConsoleView({ events: [event("understand"), event("build", { previewUrl: "/preview/task-1", progress: { build: [], repairs: [], evaluations: [] } })], history, restoreId: "task-1", missionDetail: null });
  assert.deepEqual(view.operational, { state: "running", phase: "build", label: "RUNNING · BUILD" });
  assert.deepEqual(view.pipeline.slice(0, 5).map(({ phase, status }) => [phase, status]), [["understand", "done"], ["inspect", "done"], ["plan", "done"], ["build", "running"], ["run", "pending"]]);
  assert.deepEqual(view.preview, { available: true, url: "/preview/task-1", label: "MISSION PREVIEW" });
  assert.equal(view.resumeLabel, "RESUME RUN"); assert.equal(view.canResume, true);
  assert.equal(Object.hasOwn(view, "activePhase"), false); assert.equal(Object.hasOwn(view, "executionState"), false); assert.equal(Object.hasOwn(view, "activeIndex"), false); assert.equal(Object.hasOwn(view, "progress"), false);
  assert.deepEqual(view.trace?.metrics.map(({ label, value }) => ({ label, value })), [{ label: "BUILD", value: "0" }, { label: "EVALUATE", value: "—" }, { label: "REPAIR", value: "0" }, { label: "REQUIREMENTS", value: "0" }]);
});

test("derives completed and failed terminal operational states", () => {
  const completed = deriveMissionConsoleView({ events: [event("deliver", undefined, "mission.completed")], history, restoreId: "task-1", missionDetail: null });
  assert.deepEqual(completed.operational, { state: "completed", phase: "deliver", label: "COMPLETED · DELIVER" }); assert.ok(completed.pipeline.every((item) => item.status === "done"));
  const failed = deriveMissionConsoleView({ events: [event("failed", undefined, "mission.failed")], history, restoreId: "task-1", missionDetail: null });
  assert.deepEqual(failed.operational, { state: "failed", phase: undefined, label: "FAILED" }); assert.ok(failed.pipeline.every((item) => item.status === "pending"));
});

test("effective detail and matching server snapshot override stale history", () => {
  const events = [event("build", { previewUrl: "/preview/restored" })]; const snapshot = replayMissionSnapshot(events);
  const view = deriveMissionConsoleView({ events, history, restoreId: "task-1", missionDetail: { taskId: "task-1", events, snapshot, effectiveResume: { resumable: true, restartPhase: "inspect", reason: "workspace missing", degraded: true } } });
  assert.equal(view.resumeLabel, "REBUILD FROM INSPECT"); assert.equal(view.resumeReason, "workspace missing"); assert.equal(view.canResume, true); assert.equal(view.preview.url, "/preview/restored"); assert.equal(view.operational.phase, "build");
});

test("falls back to replaying live events after a restored snapshot becomes stale", () => {
  const restoredEvents = [event("build")]; const liveEvents = [...restoredEvents, event("run", { previewUrl: "/preview/live" }, "runtime.completed")];
  const view = deriveMissionConsoleView({ events: liveEvents, history, restoreId: "task-1", missionDetail: { taskId: "task-1", events: restoredEvents, snapshot: replayMissionSnapshot(restoredEvents), effectiveResume: { resumable: true, restartPhase: "run", reason: "safe", degraded: false } } });
  assert.equal(view.operational.phase, "run"); assert.equal(view.preview.url, "/preview/live");
});

test("unselected cockpit is idle and read only", () => {
  const view = deriveMissionConsoleView({ events: [], history, restoreId: "", missionDetail: null });
  assert.deepEqual(view.operational, { state: "idle", phase: undefined, label: "IDLE" }); assert.deepEqual(view.preview, { available: false, label: "WAITING FOR BUILD" });
  assert.ok(view.pipeline.every((item) => item.status === "pending")); assert.equal(view.resumeLabel, "READ ONLY"); assert.equal(view.canResume, false); assert.equal(view.trace, undefined);
});
