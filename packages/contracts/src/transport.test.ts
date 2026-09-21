import assert from "node:assert/strict";
import test from "node:test";
import { MissionNdjsonParser, parseMissionTransportEvent } from "./transport.js";

const event = { id: "event:1", taskId: "task:1", type: "trace.updated", phase: "evaluate", timestamp: "2026-09-18T22:00:00.000Z", data: { progress: { build: [{ path: "index.html", operation: "create", requirementIds: ["acceptance:title"] }], repairs: [], evaluations: [{ iteration: 1, accepted: true, score: 1, requirementIds: ["acceptance:title"], findingCodes: [], repairActionIds: [] }] } } };

test("parses and validates a mission transport event", () => {
  assert.deepEqual(parseMissionTransportEvent(JSON.stringify(event)), event);
});

test("accepts structured inspection, runtime and resume lifecycle events", () => {
  const inspection = { id: "event:2", taskId: "task:1", type: "inspection.completed", phase: "inspect", timestamp: "2026-09-18T22:00:01.000Z", data: { evidenceCount: 2, evidenceSources: ["project", "reference"], evidenceKinds: ["code", "visual"] } };
  const runtime = { id: "event:3", taskId: "task:1", type: "runtime.completed", phase: "run", timestamp: "2026-09-18T22:00:02.000Z", data: { ok: true, durationMs: 37, previewUrl: "http://127.0.0.1:3000" } };
  const resumed = { id: "event:4", taskId: "task:1", type: "mission.resumed", phase: "run", timestamp: "2026-09-18T22:00:03.000Z", data: { restartPhase: "run" } };
  assert.deepEqual(parseMissionTransportEvent(JSON.stringify(inspection)), inspection);
  assert.deepEqual(parseMissionTransportEvent(JSON.stringify(runtime)), runtime);
  assert.deepEqual(parseMissionTransportEvent(JSON.stringify(resumed)), resumed);
});

test("rejects malformed event and malformed trace progress", () => {
  assert.throws(() => parseMissionTransportEvent("not-json"), /Invalid mission transport JSON/);
  assert.throws(() => parseMissionTransportEvent(JSON.stringify({ ...event, phase: "root" })), /Invalid mission transport event/);
  assert.throws(() => parseMissionTransportEvent(JSON.stringify({ ...event, type: "inspection.completed", phase: "inspect", data: { evidenceCount: -1 } })), /Invalid mission evidence count/);
  assert.throws(() => parseMissionTransportEvent(JSON.stringify({ ...event, data: { progress: { build: [{ path: "index.html", operation: "execute", requirementIds: [] }], repairs: [], evaluations: [] } } })), /Invalid mission trace progress/);
});

test("NDJSON parser preserves split chunks and flushes final line", () => {
  const parser = new MissionNdjsonParser();
  const line = JSON.stringify(event);
  assert.deepEqual(parser.push(line.slice(0, 20)), []);
  assert.deepEqual(parser.push(`${line.slice(20)}\n${line.slice(0, 15)}`), [event]);
  assert.deepEqual(parser.push(line.slice(15)), []);
  assert.deepEqual(parser.finish(), [event]);
});
