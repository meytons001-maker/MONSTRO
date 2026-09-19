import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "./mission.js";
import { InMemoryMissionJournalStore } from "./mission-store.js";

const task: MonstroTask = {
  id: "mission-1",
  intent: "build a preview",
  phase: "understand",
  context: { projectId: "demo", rootDir: ".", summary: "", decisions: [] },
  requestedCapabilities: [],
  acceptance: [],
  iteration: 0,
  maxIterations: 2,
};

test("MissionJournal stores and publishes immutable snapshots", async () => {
  const journal = new MissionJournal();
  const observed: string[] = [];
  journal.subscribe((event) => {
    observed.push(event.type);
  });

  await journal.record(task, "phase.changed", "ready", { nested: { value: 1 } });
  const snapshot = journal.snapshot();
  (snapshot[0]?.data?.nested as { value: number }).value = 99;

  assert.equal(journal.snapshot().length, 1);
  assert.deepEqual(journal.snapshot()[0]?.data, { nested: { value: 1 } });
  assert.deepEqual(observed, ["phase.changed"]);
});

test("MissionJournal persists events and deterministically replays a mission", async () => {
  const store = new InMemoryMissionJournalStore();
  const journal = new MissionJournal(store);

  await journal.record(task, "phase.changed", "ready");
  task.phase = "plan";
  await journal.record(task, "iteration.started", "iteration 1", { iteration: 1 });

  const replayed = await MissionJournal.replay(task.id, store);
  const events = replayed.snapshot();

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.id), ["mission-1:1", "mission-1:2"]);
  assert.deepEqual(events.map((event) => event.type), ["phase.changed", "iteration.started"]);
  assert.equal(events[1]?.phase, "plan");

  task.phase = "run";
  await replayed.record(task, "phase.changed", "resumed");
  assert.equal(replayed.snapshot()[2]?.id, "mission-1:3");
  assert.equal((await store.load(task.id)).length, 3);
});
