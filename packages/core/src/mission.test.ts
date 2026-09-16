import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "./mission.js";

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

  await journal.record(task, "phase.changed", "ready");
  const snapshot = journal.snapshot();

  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0]?.detail, "ready");
  assert.deepEqual(observed, ["phase.changed"]);
});
