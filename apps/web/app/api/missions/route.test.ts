import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "@monstro/core";
import { createMissionJournalStore } from "../../../lib/mission-persistence.ts";
import { POST } from "./route.ts";

function request(body: unknown) {
  return new Request("http://localhost/api/missions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function task(id: string): MonstroTask {
  return {
    id,
    intent: "resume route fixture",
    phase: "deliver",
    context: { projectId: id, rootDir: ".", summary: "route fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

async function withJournalDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "monstro-route-"));
  const previous = process.env.MONSTRO_MISSION_JOURNAL_DIR;
  process.env.MONSTRO_MISSION_JOURNAL_DIR = directory;
  try {
    await run(directory);
  } finally {
    if (previous === undefined) delete process.env.MONSTRO_MISSION_JOURNAL_DIR;
    else process.env.MONSTRO_MISSION_JOURNAL_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test("POST rejects an empty new mission before creating runtime work", async () => {
  await withJournalDirectory(async () => {
    const response = await POST(request({}));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Mission intent is required." });
  });
});

test("POST returns 404 when resumeTaskId has no persisted journal", async () => {
  await withJournalDirectory(async () => {
    const response = await POST(request({ resumeTaskId: "missing-mission" }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Mission not found." });
  });
});

test("POST returns 409 when the persisted mission is not safely resumable", async () => {
  await withJournalDirectory(async () => {
    const current = task("completed-mission");
    const journal = new MissionJournal(createMissionJournalStore());
    await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });
    await journal.record(current, "mission.completed", "done");

    const response = await POST(request({ resumeTaskId: current.id }));
    assert.equal(response.status, 409);
    const body = await response.json() as { error?: string; reason?: string };
    assert.equal(body.error, "Mission cannot be resumed safely.");
    assert.match(body.reason ?? "", /already completed/);
  });
});
