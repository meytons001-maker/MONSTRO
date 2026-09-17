import assert from "node:assert/strict";
import test from "node:test";
import type { Evaluation, MonstroTask } from "@monstro/contracts";
import { ModelRouter, type AiProvider } from "./index.ts";
import { generateAiRepair } from "./repairer.ts";

function task(): MonstroTask {
  return { id: "repair", intent: "repair preview", phase: "repair", context: { projectId: "repair", rootDir: ".", summary: "test", decisions: [] }, requestedCapabilities: [], acceptance: [], iteration: 1, maxIterations: 2 };
}

function evaluation(): Evaluation {
  return { accepted: false, score: 0, findings: [{ code: "document.title", message: "bad title", severity: "error" }], nextActions: [{ id: "fix", findingCode: "document.title", description: "fix title", targetPath: "preview.mjs" }] };
}

function router(output: string): ModelRouter {
  const provider: AiProvider = { id: "fixture", capabilities: new Set(["code"]), async generate() { return { provider: "fixture", model: "test", output, durationMs: 1 }; } };
  return new ModelRouter().register(provider);
}

test("returns undefined when no code provider is configured", async () => {
  assert.equal(await generateAiRepair(new ModelRouter(), task(), evaluation(), []), undefined);
});

test("returns undefined for accepted evaluation", async () => {
  const accepted = { ...evaluation(), accepted: true, nextActions: [] };
  assert.equal(await generateAiRepair(router('{"patches":[]}'), task(), accepted, []), undefined);
});

test("normalizes a repair constrained to requested target paths", async () => {
  const result = await generateAiRepair(router('{"patches":[{"path":"preview.mjs","operation":"update","content":"fixed"}]}'), task(), evaluation(), [{ path: "preview.mjs", content: "broken" }]);
  assert.deepEqual(result?.patches, [{ path: "preview.mjs", operation: "update", content: "fixed" }]);
});

test("rejects repair patches outside evaluator targets", async () => {
  await assert.rejects(() => generateAiRepair(router('{"patches":[{"path":"other.mjs","operation":"update","content":"x"}]}'), task(), evaluation(), []), /unrequested path/);
});

test("rejects unsafe target paths before invoking AI", async () => {
  const unsafe = { ...evaluation(), nextActions: [{ id: "bad", findingCode: "document.title" as const, description: "bad", targetPath: "../secret" }] };
  await assert.rejects(() => generateAiRepair(router('{"patches":[]}'), task(), unsafe, []), /unsafe/);
});

test("rejects duplicate repair paths", async () => {
  const output = '{"patches":[{"path":"preview.mjs","operation":"update","content":"a"},{"path":"preview.mjs","operation":"update","content":"b"}]}';
  await assert.rejects(() => generateAiRepair(router(output), task(), evaluation(), []), /duplicate/);
});
