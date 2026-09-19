import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan, MonstroTask } from "@monstro/contracts";
import { generateAiBuild, ModelRouter, type AiProvider } from "./index.ts";

const task: MonstroTask = { id: "build-1", intent: "build preview", phase: "build", context: { projectId: "build-1", rootDir: ".", summary: "fixture", decisions: [] }, requestedCapabilities: [], acceptance: [], iteration: 1, maxIterations: 2 };
const plan: BuildPlan = { taskId: task.id, rationale: "fixture", requirements: [{ id: "artifact:web-preview", description: "Produce a web preview", source: "understanding", required: true }], steps: [{ id: "one", title: "Create preview", description: "Create preview.mjs", status: "pending" }] };

function router(output: string, capabilities = new Set(["code"] as const), inspect?: (request: Parameters<AiProvider["generate"]>[0]) => void) {
  const provider: AiProvider = { id: "fixture", capabilities, async generate(request) { inspect?.(request); return { provider: "fixture", model: "fixture-model", output, durationMs: 1 }; } };
  return new ModelRouter().register(provider);
}

const validPatch = '{"patches":[{"path":"src/app.mjs","operation":"create","content":"console.log(1)","requirementIds":["artifact:web-preview"]}]}';

test("AI Builder returns undefined without a code provider", async () => {
  assert.equal(await generateAiBuild(new ModelRouter(), task, plan), undefined);
});

test("AI Builder normalizes validated patches with requirement provenance", async () => {
  const result = await generateAiBuild(router(validPatch), task, plan);
  assert.deepEqual(result?.patches, [{ path: "src/app.mjs", operation: "create", content: "console.log(1)", requirementIds: ["artifact:web-preview"] }]);
  assert.equal(result?.provider, "fixture");
});

test("AI Builder receives structured build requirements", async () => {
  let prompt = "";
  await generateAiBuild(router('{"patches":[{"path":"preview.mjs","operation":"create","content":"export {}","requirementIds":["artifact:web-preview"]}]}', new Set(["code"] as const), (request) => { prompt = request.prompt; }), task, plan);
  const payload = JSON.parse(prompt) as { plan: { requirements: BuildPlan["requirements"] } };
  assert.deepEqual(payload.plan.requirements, plan.requirements);
});

test("AI Builder rejects missing or unknown requirement provenance", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"create","content":"x"}]}'), task, plan), /requirementIds are required/);
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"create","content":"x","requirementIds":["unknown"]}]}'), task, plan), /requirementId is invalid/);
});

test("AI Builder rejects workspace traversal", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"../secret","operation":"create","content":"x","requirementIds":["artifact:web-preview"]}]}'), task, plan), /unsafe/);
});

test("AI Builder rejects absolute and git paths", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"/tmp/x","operation":"create","content":"x","requirementIds":["artifact:web-preview"]}]}'), task, plan), /relative/);
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":".git/config","operation":"update","content":"x","requirementIds":["artifact:web-preview"]}]}'), task, plan), /\.git/);
});

test("AI Builder rejects duplicate paths and malformed operations", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"create","content":"1","requirementIds":["artifact:web-preview"]},{"path":"a.txt","operation":"update","content":"2","requirementIds":["artifact:web-preview"]}]}'), task, plan), /duplicate/);
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"execute","content":"x","requirementIds":["artifact:web-preview"]}]}'), task, plan), /operation/);
});
