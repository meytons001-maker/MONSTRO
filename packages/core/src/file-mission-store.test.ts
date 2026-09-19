import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { FileMissionJournalStore } from "./file-mission-store.js";
import { MissionJournal } from "./mission.js";

function task(id: string): MonstroTask {
  return {
    id,
    intent: "persist a mission",
    phase: "understand",
    context: { projectId: "test", rootDir: ".", summary: "", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

test("FileMissionJournalStore persists NDJSON and replays after a new store instance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monstro-journal-"));
  try {
    const firstStore = new FileMissionJournalStore({ directory });
    const mission = task("mission/file 1");
    const journal = new MissionJournal(firstStore);

    await journal.record(mission, "phase.changed", "understood", { requirementIds: ["r1"] });
    mission.phase = "plan";
    await journal.record(mission, "phase.changed", "planned");

    const secondStore = new FileMissionJournalStore({ directory });
    const replayed = await MissionJournal.replay(mission.id, secondStore);
    assert.deepEqual(replayed.snapshot().map((event) => event.id), ["mission/file 1:1", "mission/file 1:2"]);
    assert.deepEqual(replayed.snapshot()[0]?.data?.requirementIds, ["r1"]);

    mission.phase = "build";
    await replayed.record(mission, "build.applied", "continued after restart");
    assert.equal(replayed.snapshot()[2]?.id, "mission/file 1:3");

    const raw = await readFile(join(directory, "mission%2Ffile%201.ndjson"), "utf8");
    assert.equal(raw.trim().split("\n").length, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FileMissionJournalStore serializes concurrent appends per mission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monstro-journal-"));
  try {
    const store = new FileMissionJournalStore({ directory });
    const mission = task("parallel");
    const journal = new MissionJournal(store);
    await Promise.all(Array.from({ length: 8 }, (_, index) => journal.record(mission, "trace.updated", `event ${index}`)));
    const loaded = await store.load(mission.id);
    assert.equal(loaded.length, 8);
    assert.equal(new Set(loaded.map((event) => event.id)).size, 8);
    assert.deepEqual(loaded.map((event) => event.id), Array.from({ length: 8 }, (_, index) => `parallel:${index + 1}`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FileMissionJournalStore rejects corrupt journal records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monstro-journal-"));
  try {
    await writeFile(join(directory, "corrupt.ndjson"), "{not-json}\n", "utf8");
    const store = new FileMissionJournalStore({ directory });
    await assert.rejects(() => store.load("corrupt"), /Invalid mission journal record at line 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
