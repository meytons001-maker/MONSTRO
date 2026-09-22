import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import type { MissionEvent } from "@monstro/core";
import { MissionJournal } from "@monstro/core";
import { createMissionEventStream } from "./mission-stream.ts";

function task(id = "stream-task"): MonstroTask {
  return {
    id,
    intent: "stream fixture",
    phase: "run",
    context: { projectId: id, rootDir: ".", summary: "fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

async function readEvents(response: Response): Promise<MissionEvent[]> {
  const body = await response.text();
  return body.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as MissionEvent);
}

test("streams mission events as NDJSON and exposes transport metadata", async () => {
  const current = task();
  const journal = new MissionJournal();
  const persisted: MissionEvent[] = [];
  const response = createMissionEventStream({
    task: current,
    journal,
    sink: { append(event) { persisted.push(event); } },
    resumePhase: "run",
    execute: async () => {
      await journal.record(current, "mission.resumed", "run");
      current.phase = "deliver";
      await journal.record(current, "mission.completed", "done");
    },
  });

  assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-monstro-task"), current.id);
  assert.equal(response.headers.get("x-monstro-resume"), "run");
  const streamed = await readEvents(response);
  assert.deepEqual(streamed.map((event) => event.type), ["mission.resumed", "mission.completed"]);
  assert.deepEqual(persisted.map((event) => event.type), streamed.map((event) => event.type));
});

test("waits for pending persistence before closing the response", async () => {
  const current = task("stream-persistence");
  const journal = new MissionJournal();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let persisted = false;
  const response = createMissionEventStream({
    task: current,
    journal,
    sink: { async append() { await gate; persisted = true; } },
    execute: () => journal.record(current, "mission.completed", "done"),
  });

  let responseFinished = false;
  const reading = response.text().then(() => { responseFinished = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(responseFinished, false);
  assert.equal(persisted, false);
  release();
  await reading;
  assert.equal(persisted, true);
});

test("closes after orchestrator failure while preserving the recorded failure event", async () => {
  const current = task("stream-failure");
  const journal = new MissionJournal();
  const response = createMissionEventStream({
    task: current,
    journal,
    sink: { append() {} },
    execute: async () => {
      await journal.record(current, "mission.failed", "expected fixture failure");
      throw new Error("expected fixture failure");
    },
  });

  const streamed = await readEvents(response);
  assert.equal(streamed.length, 1);
  assert.equal(streamed[0]?.type, "mission.failed");
  assert.equal(streamed[0]?.detail, "expected fixture failure");
});
