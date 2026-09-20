import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BuildPlan, MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "@monstro/core";
import { createMissionJournalStore } from "../../../lib/mission-persistence.ts";
import { previewRegistry } from "../../../lib/preview-registry.ts";
import { GET, POST } from "./route.ts";

function request(body: unknown) {
  return new Request("http://localhost/api/missions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function detailRequest(taskId: string) {
  return new Request(`http://localhost/api/missions?taskId=${encodeURIComponent(taskId)}`);
}

function task(id: string, rootDir = "."): MonstroTask {
  return {
    id,
    intent: "resume route fixture",
    phase: "deliver",
    context: { projectId: id, rootDir, summary: "route fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

function persistedPlan(current: MonstroTask): BuildPlan {
  return {
    taskId: current.id,
    rationale: "persisted route fixture plan",
    requirements: [],
    steps: [{ id: "build", title: "Build", description: "already applied", status: "done" }],
  };
}

async function persistConfirmedBuild(current: MonstroTask) {
  const journal = new MissionJournal(createMissionJournalStore());
  await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });
  await journal.record(current, "build.applied", "already applied", { plan: structuredClone(persistedPlan(current)), requirementIds: [] });
  await journal.record(current, "trace.updated", "build traced", {
    progress: { build: [{ path: "preview.mjs", operation: "create", requirementIds: [] }], repairs: [], evaluations: [] },
    snapshot: { buildPatches: [{ path: "preview.mjs", operation: "create", content: "persisted", requirementIds: [] }], repairPatches: [], evaluations: [] },
  });
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

test("GET mission detail exposes the effective resume decision", async () => {
  await withJournalDirectory(async (directory) => {
    const current = task("detail-missing-workspace", directory);
    current.phase = "build";
    await persistConfirmedBuild(current);

    const response = await GET(detailRequest(current.id));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as {
      resume?: { restartPhase?: string | null };
      effectiveResume?: { resumable?: boolean; restartPhase?: string | null; degraded?: boolean; reason?: string };
    };
    assert.equal(body.resume?.restartPhase, "run");
    assert.equal(body.effectiveResume?.resumable, true);
    assert.equal(body.effectiveResume?.restartPhase, "inspect");
    assert.equal(body.effectiveResume?.degraded, true);
    assert.match(body.effectiveResume?.reason ?? "", /rebuilding conservatively from inspect/i);
  });
});

test("POST resumes a confirmed build through runtime and streams completion", async () => {
  await withJournalDirectory(async (directory) => {
    const current = task("resumable-mission", directory);
    current.phase = "build";
    const workspace = join(directory, current.context.projectId);
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "preview.mjs"), `import http from "node:http";\nconst args=process.argv.slice(2);\nconst value=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};\nconst port=Number(value("--port", "3000"));\nconst host=value("--host", "127.0.0.1");\nhttp.createServer((req,res)=>{if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true}));return}res.writeHead(200,{"content-type":"text/html"});res.end("<!doctype html><title>MONSTRO Preview</title><h1>MONSTRO LIVE PREVIEW</h1>")}).listen(port,host);\n`, "utf8");
    await persistConfirmedBuild(current);

    try {
      const response = await POST(request({ resumeTaskId: current.id }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-monstro-task"), current.id);
      assert.equal(response.headers.get("x-monstro-resume"), "run");
      const events = (await response.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { type?: string });
      assert.equal(events[0]?.type, "mission.resumed");
      assert.ok(events.some((event) => event.type === "iteration.started"));
      assert.equal(events.at(-1)?.type, "mission.completed");
    } finally {
      await previewRegistry.remove(current.id);
    }
  });
});

test("POST rebuilds conservatively from inspect when a confirmed build workspace is missing", async () => {
  await withJournalDirectory(async (directory) => {
    const current = task("missing-workspace-mission", directory);
    current.phase = "build";
    await persistConfirmedBuild(current);

    try {
      const response = await POST(request({ resumeTaskId: current.id }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-monstro-task"), current.id);
      assert.equal(response.headers.get("x-monstro-resume"), "inspect");

      const events = (await response.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { type?: string; phase?: string; detail?: string });
      assert.equal(events[0]?.type, "mission.resumed");
      assert.equal(events[0]?.phase, "inspect");
      assert.match(events[0]?.detail ?? "", /rebuilding conservatively from inspect/i);
      assert.ok(events.some((event) => event.type === "phase.changed" && event.phase === "inspect"));
      assert.ok(events.some((event) => event.type === "build.applied"));
      assert.equal(events.at(-1)?.type, "mission.completed");
    } finally {
      await previewRegistry.remove(current.id);
    }
  });
});
