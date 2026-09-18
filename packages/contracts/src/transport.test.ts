import assert from "node:assert/strict";
import test from "node:test";
import { MissionNdjsonParser, parseMissionTransportEvent } from "./transport";

const event = { id: "event:1", taskId: "task:1", type: "trace.updated", phase: "evaluate", timestamp: "2026-09-18T22:00:00.000Z", data: { progress: { build: [{ path: "index.html", operation: "create", requirementIds: ["acceptance:title"] }], repairs: [], evaluations: [{ iteration: 1, accepted: true, score: 1, requirementIds: ["acceptance:title"], findingCodes: [], repairActionIds: [] }] } } };

test("parses and validates a mission transport event", () => {
  assert.deepEqual(parseMissionTransportEvent(JSON.stringify(event)), event);
});

test("rejects malformed event and malformed trace progress", () => {
  assert.throws(() => parseMissionTransportEvent("not-json"), /Invalid mission transport JSON/);
  assert.throws(() => parseMissionTransportEvent(JSON.stringify({ ...event, phase: "root" })), /Invalid mission transport event/);
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
