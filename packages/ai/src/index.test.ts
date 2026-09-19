import assert from "node:assert/strict";
import test from "node:test";
import { AiRoutingError, ModelRouter, type AiCapability, type AiProvider, type AiRequest } from "./index.js";

function provider(id: string, capabilities: AiCapability[]): AiProvider {
  return {
    id,
    capabilities: new Set(capabilities),
    async generate(request: AiRequest) {
      return { provider: id, model: `${id}-fixture`, output: `${request.capability}:${request.prompt}`, durationMs: 1 };
    },
  };
}

test("routes a request to a provider with the required capability", async () => {
  const router = new ModelRouter()
    .register(provider("local", ["code", "reasoning"]))
    .register(provider("vision", ["vision"]));

  const response = await router.generate({ capability: "vision", prompt: "inspect preview" });
  assert.equal(response.provider, "vision");
  assert.equal(response.output, "vision:inspect preview");
});

test("honors an explicitly preferred compatible provider", async () => {
  const router = new ModelRouter()
    .register(provider("fast", ["code"]))
    .register(provider("deep", ["code", "reasoning"]));

  const response = await router.generate({ capability: "code", prompt: "repair module", preferredProvider: "deep" });
  assert.equal(response.provider, "deep");
});

test("rejects missing capabilities, incompatible providers and empty prompts", async () => {
  const router = new ModelRouter().register(provider("code-only", ["code"]));

  assert.throws(() => router.resolve({ capability: "vision", prompt: "inspect" }), AiRoutingError);
  assert.throws(() => router.resolve({ capability: "vision", prompt: "inspect", preferredProvider: "code-only" }), AiRoutingError);
  await assert.rejects(() => router.generate({ capability: "code", prompt: "   " }), AiRoutingError);
});
