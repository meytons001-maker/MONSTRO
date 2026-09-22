import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "@monstro/core";
import { createMissionJournalStore, listPersistedMissions, loadPersistedMission } from "./mission-persistence.ts";

function task(id: string): MonstroTask {
  return {
    id,
    intent: "resume fixture",
    phase: "understand",
    context: { projectId: id, rootDir: ".", summary: "fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

test("persisted mission history degrades run to inspect when workspace is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monstro-web-resume-"));
  const previous = process.env.MONSTRO_MISSION_JOURNAL_DIR;
  process.env.MONSTRO_MISSION_JOURNAL_DIR = directory;

  try {
    const current = task("resume-web-1");
    const journal = new MissionJournal(createMissionJournalStore());
    current.phase = "build";
    await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });
    await journal.record(current, "build.applied", "confirmed");

    const persisted = await loadPersistedMission(current.id);
    assert.equal(persisted.resume.resumable, true);
    assert.equal(persisted.resume.restartPhase, "run");
    assert.equal(persisted.resume.task?.id, current.id);

    const history = await listPersistedMissions();
    assert.equal(history.length, 1);
    assert.equal(history[0]?.resumable, true);
    assert.equal(history[0]?.restartPhase, "inspect");
    assert.match(history[0]?.resumeReason ?? "", /rebuilding conservatively from inspect/i);
    assert.match(history[0]?.resumeReason ?? "", /workspace is unavailable/i);
  } finally {
    if (previous === undefined) delete process.env.MONSTRO_MISSION_JOURNAL_DIR;
    else process.env.MONSTRO_MISSION_JOURNAL_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("completed persisted missions are explicitly non-resumable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monstro-web-complete-"));
  const previous = process.env.MONSTRO_MISSION_JOURNAL_DIR;
  process.env.MONSTRO_MISSION_JOURNAL_DIR = directory;

  try {
    const current = task("resume-web-2");
    const journal = new MissionJournal(createMissionJournalStore());
    current.phase = "deliver";
    await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });
    await journal.record(current, "mission.completed", "done");

    const persisted = await loadPersistedMission(current.id);
    assert.equal(persisted.resume.resumable, false);
    assert.equal(persisted.resume.restartPhase, null);
    assert.match(persisted.resume.reason, /already completed/);
  } finally {
    if (previous === undefined) delete process.env.MONSTRO_MISSION_JOURNAL_DIR;
    else process.env.MONSTRO_MISSION_JOURNAL_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
