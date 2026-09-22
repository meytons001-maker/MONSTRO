import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

test("sends chat completion requests and normalizes response metadata", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ model: "fixture-model", choices: [{ message: { content: "generated code" } }], usage: { prompt_tokens: 12, completion_tokens: 4 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const provider = new OpenAiCompatibleProvider({ id: "fixture", baseUrl: "http://127.0.0.1:11434/v1/", model: "local-model", apiKey: "test-key", fetch: fetchMock });
  const result = await provider.generate({ capability: "code", system: "Be precise", prompt: "Build module" });

  assert.equal(requestUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal((requestInit?.headers as Record<string, string>).authorization, "Bearer test-key");
  const body = JSON.parse(String(requestInit?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
  assert.equal(body.model, "local-model");
  assert.deepEqual(body.messages.map((message) => message.role), ["system", "user"]);
  assert.equal(result.provider, "fixture");
  assert.equal(result.model, "fixture-model");
  assert.equal(result.output, "generated code");
  assert.equal(result.usage?.inputTokens, 12);
  assert.equal(result.usage?.outputTokens, 4);
});

test("rejects incompatible capability and upstream errors", async () => {
  const provider = new OpenAiCompatibleProvider({ id: "code", baseUrl: "http://localhost/v1", model: "fixture", capabilities: ["code"], fetch: async () => new Response("upstream unavailable", { status: 503 }) });
  await assert.rejects(() => provider.generate({ capability: "vision", prompt: "inspect" }), /does not support vision/);
  await assert.rejects(() => provider.generate({ capability: "code", prompt: "build" }), /HTTP 503/);
});
