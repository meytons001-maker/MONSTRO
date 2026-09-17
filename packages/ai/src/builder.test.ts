import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan, MonstroTask } from "@monstro/contracts";
import { generateAiBuild, ModelRouter, type AiProvider } from "./index.ts";

const task: MonstroTask = { id: "build-1", intent: "build preview", phase: "build", context: { projectId: "build-1", rootDir: ".", summary: "fixture", decisions: [] }, requestedCapabilities: [], acceptance: [], iteration: 1, maxIterations: 2 };
const plan: BuildPlan = { taskId: task.id, rationale: "fixture", steps: [{ id: "one", title: "Create preview", description: "Create preview.mjs", status: "pending" }] };

function router(output: string, capabilities = new Set(["code"] as const)) {
  const provider: AiProvider = { id: "fixture", capabilities, async generate() { return { provider: "fixture", model: "fixture-model", output, durationMs: 1 }; } };
  return new ModelRouter().register(provider);
}

test("AI Builder returns undefined without a code provider", async () => {
  assert.equal(await generateAiBuild(new ModelRouter(), task, plan), undefined);
});

test("AI Builder normalizes validated patches", async () => {
  const result = await generateAiBuild(router('{"patches":[{"path":"src/app.mjs","operation":"create","content":"console.log(1)"}]}'), task, plan);
  assert.deepEqual(result?.patches, [{ path: "src/app.mjs", operation: "create", content: "console.log(1)" }]);
  assert.equal(result?.provider, "fixture");
});

test("AI Builder rejects workspace traversal", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"../secret","operation":"create","content":"x"}]}'), task, plan), /unsafe/);
});

test("AI Builder rejects absolute and git paths", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"/tmp/x","operation":"create","content":"x"}]}'), task, plan), /relative/);
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":".git/config","operation":"update","content":"x"}]}'), task, plan), /\.git/);
});

test("AI Builder rejects duplicate paths and malformed operations", async () => {
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"create","content":"1"},{"path":"a.txt","operation":"update","content":"2"}]}'), task, plan), /duplicate/);
  await assert.rejects(() => generateAiBuild(router('{"patches":[{"path":"a.txt","operation":"execute","content":"x"}]}'), task, plan), /operation/);
});
