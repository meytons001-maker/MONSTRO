import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent, TaskPhase } from "@monstro/contracts";
import { replayMissionSnapshot } from "./mission-replay-snapshot.ts";

function event(id: string, type: MissionTransportEvent["type"], phase: TaskPhase, data?: MissionTransportEvent["data"]): MissionTransportEvent {
  return { id, taskId: "snapshot-mission", type, phase, timestamp: `2026-09-21T00:00:0${id}.000Z`, data };
}

test("replays a deterministic operational snapshot from journal events", () => {
  const events: MissionTransportEvent[] = [
    event("1", "understanding.completed", "understand", { profile: "interactive-web", artifact: "web-preview", interactivity: "interactive", experienceFidelity: "required", rationale: "interactive mission", acceptanceCount: 2 }),
    event("2", "runtime.completed", "run", { ok: true, durationMs: 25, previewUrl: "http://127.0.0.1:3000" }),
    event("3", "trace.updated", "evaluate", { progress: { build: [{ path: "index.html", operation: "create", requirementIds: [] }], repairs: [], evaluations: [] } }),
  ];

  const snapshot = replayMissionSnapshot(events);
  assert.equal(snapshot.taskId, "snapshot-mission");
  assert.equal(snapshot.eventCount, 3);
  assert.equal(snapshot.executionState, "running");
  assert.equal(snapshot.activePhase, "evaluate");
  assert.equal(snapshot.previewUrl, "http://127.0.0.1:3000");
  assert.equal(snapshot.progress?.build.length, 1);
  assert.equal(snapshot.evidence.find((item) => item.phase === "understand")?.summary, "interactive mission");
});

test("replays terminal states and empty journals without inventing mission state", () => {
  const completed = replayMissionSnapshot([
    event("1", "phase.changed", "deliver"),
    event("2", "mission.completed", "deliver", { artifacts: ["index.html"] }),
  ]);
  assert.equal(completed.executionState, "completed");
  assert.equal(completed.activePhase, "deliver");
  assert.equal(completed.lastEvent?.type, "mission.completed");

  const empty = replayMissionSnapshot([]);
  assert.equal(empty.taskId, null);
  assert.equal(empty.eventCount, 0);
  assert.equal(empty.executionState, "idle");
  assert.equal(empty.activePhase, undefined);
  assert.equal(empty.lastEvent, null);
});
