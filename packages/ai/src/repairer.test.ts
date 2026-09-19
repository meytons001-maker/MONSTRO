import assert from "node:assert/strict";
import test from "node:test";
import type { Evaluation, MonstroTask } from "@monstro/contracts";
import { ModelRouter, type AiProvider } from "./index.ts";
import { generateAiRepair } from "./repairer.ts";

const REQUIREMENT_ID = "acceptance:preview-ok";

function task(): MonstroTask {
  const acceptance = [{ id: "preview-ok", description: "Preview must be valid", required: true, repairTargetPath: "preview.mjs" }];
  return {
    id: "repair",
    intent: "repair preview",
    phase: "repair",
    context: {
      projectId: "repair",
      rootDir: ".",
      summary: "test",
      decisions: [],
      understanding: {
        profile: "web",
        artifact: "web-preview",
        interactivity: "structural",
        rationale: "test mission",
        experienceFidelity: "advisory",
        acceptance,
      },
    },
    requestedCapabilities: [],
    acceptance,
    iteration: 1,
    maxIterations: 2,
  };
}

function evaluation(): Evaluation {
  return {
    accepted: false,
    score: 0,
    findings: [{ code: "document.title", message: "bad title", severity: "error", requirementIds: [REQUIREMENT_ID] }],
    nextActions: [{ id: "fix", findingCode: "document.title", description: "fix title", targetPath: "preview.mjs", requirementIds: [REQUIREMENT_ID] }],
  };
}

function router(output: string): ModelRouter {
  const provider: AiProvider = { id: "fixture", capabilities: new Set(["code"]), async generate() { return { provider: "fixture", model: "test", output, durationMs: 1 }; } };
  return new ModelRouter().register(provider);
}

function patch(path = "preview.mjs", content = "fixed"): string {
  return JSON.stringify({ patches: [{ path, operation: "update", content, requirementIds: [REQUIREMENT_ID] }] });
}

test("returns undefined when no code provider is configured", async () => {
  assert.equal(await generateAiRepair(new ModelRouter(), task(), evaluation(), []), undefined);
});

test("returns undefined for accepted evaluation", async () => {
  const accepted = { ...evaluation(), accepted: true, nextActions: [] };
  assert.equal(await generateAiRepair(router('{"patches":[]}'), task(), accepted, []), undefined);
});

test("normalizes a repair constrained to requested target paths with requirement provenance", async () => {
  const result = await generateAiRepair(router(patch()), task(), evaluation(), [{ path: "preview.mjs", content: "broken" }]);
  assert.deepEqual(result?.patches, [{ path: "preview.mjs", operation: "update", content: "fixed", requirementIds: [REQUIREMENT_ID] }]);
});

test("rejects repair patches outside evaluator targets", async () => {
  await assert.rejects(() => generateAiRepair(router(patch("other.mjs", "x")), task(), evaluation(), []), /unrequested path/);
});

test("rejects unknown or missing requirement provenance", async () => {
  const unknown = JSON.stringify({ patches: [{ path: "preview.mjs", operation: "update", content: "x", requirementIds: ["acceptance:unknown"] }] });
  const missing = JSON.stringify({ patches: [{ path: "preview.mjs", operation: "update", content: "x" }] });
  await assert.rejects(() => generateAiRepair(router(unknown), task(), evaluation(), []), /requirementId is invalid/);
  await assert.rejects(() => generateAiRepair(router(missing), task(), evaluation(), []), /requirementIds are required/);
});

test("rejects unsafe target paths before invoking AI", async () => {
  const unsafe = { ...evaluation(), nextActions: [{ id: "bad", findingCode: "document.title" as const, description: "bad", targetPath: "../secret", requirementIds: [REQUIREMENT_ID] }] };
  await assert.rejects(() => generateAiRepair(router('{"patches":[]}'), task(), unsafe, []), /unsafe/);
});

test("rejects duplicate repair paths", async () => {
  const output = JSON.stringify({ patches: [
    { path: "preview.mjs", operation: "update", content: "a", requirementIds: [REQUIREMENT_ID] },
    { path: "preview.mjs", operation: "update", content: "b", requirementIds: [REQUIREMENT_ID] },
  ] });
  await assert.rejects(() => generateAiRepair(router(output), task(), evaluation(), []), /duplicate/);
});
