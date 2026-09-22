import assert from "node:assert/strict";
import test from "node:test";
import type { MissionUnderstanding } from "@monstro/contracts";
import { ModelRouter, type AiProvider } from "./index.js";
import { generateAiPlan, requirementsFromUnderstanding } from "./planner.js";

function provider(output: string): AiProvider {
  return {
    id: "fixture",
    capabilities: new Set(["reasoning"]),
    async generate() { return { provider: "fixture", model: "test-model", output, durationMs: 1 }; },
  };
}

const understanding: MissionUnderstanding = {
  profile: "interactive-web",
  artifact: "web-preview",
  interactivity: "interactive",
  experienceFidelity: "required",
  rationale: "Reference requires observable fidelity",
  acceptance: [{ id: "preview-ok", description: "Preview must be valid", required: true }],
};

test("AI planner returns undefined when no reasoning provider is configured", async () => {
  assert.equal(await generateAiPlan(new ModelRouter(), "build preview", ["intent observed"]), undefined);
});

test("derives typed build requirements from mission understanding", () => {
  const requirements = requirementsFromUnderstanding(understanding);
  assert.deepEqual(requirements.map((item) => item.id), ["artifact", "interactivity", "experience-fidelity", "acceptance:preview-ok"]);
  assert.equal(requirements.find((item) => item.id === "experience-fidelity")?.required, true);
  assert.equal(requirements.find((item) => item.id === "acceptance:preview-ok")?.source, "acceptance");
});

test("AI planner normalizes a structured plan", async () => {
  const router = new ModelRouter().register(provider('```json\n{"rationale":"Build the smallest valid preview","steps":[{"title":"Create preview","description":"Generate the preview server"},{"title":"Verify","description":"Run and observe it"}]}\n```'));
  const plan = await generateAiPlan(router, "build preview", ["intent observed"], understanding);
  assert.equal(plan?.provider, "fixture");
  assert.equal(plan?.model, "test-model");
  assert.equal(plan?.steps.length, 2);
  assert.equal(plan?.steps[0]?.title, "Create preview");
});

test("AI planner rejects malformed provider output", async () => {
  const router = new ModelRouter().register(provider("not-json"));
  await assert.rejects(() => generateAiPlan(router, "build preview", []), /invalid JSON/);
});

test("AI planner rejects incomplete plans", async () => {
  const router = new ModelRouter().register(provider('{"rationale":"ok","steps":[]}'));
  await assert.rejects(() => generateAiPlan(router, "build preview", []), /incomplete plan/);
});
