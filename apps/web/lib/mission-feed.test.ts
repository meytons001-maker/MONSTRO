import assert from "node:assert/strict";
import test from "node:test";
import type { MissionTransportEvent, TaskPhase } from "@monstro/contracts";
import { deriveMissionFeed } from "./mission-feed.ts";

function event(id: number, phase: TaskPhase, detail?: string): MissionTransportEvent {
  return {
    id: `event-${id}`,
    taskId: "task-1",
    type: "phase.changed",
    phase,
    timestamp: "2026-09-21T10:00:00.000Z",
    detail,
  };
}

test("projects the most recent mission events for presentation", () => {
  const feed = deriveMissionFeed([
    event(1, "understand"),
    event(2, "inspect"),
    event(3, "plan"),
    event(4, "build", "patch applied"),
    event(5, "run", "  runtime healthy  "),
  ]);

  assert.deepEqual(feed.map((item) => item.id), ["event-2", "event-3", "event-4", "event-5"]);
  assert.equal(feed.at(-1)?.phase, "RUN");
  assert.equal(feed.at(-1)?.detail, "runtime healthy");
});

test("supports empty and bounded feed projections", () => {
  assert.deepEqual(deriveMissionFeed([], 4), []);
  assert.deepEqual(deriveMissionFeed([event(1, "understand")], 0), []);
  assert.equal(deriveMissionFeed([event(1, "understand"), event(2, "inspect")], 1).length, 1);
});
