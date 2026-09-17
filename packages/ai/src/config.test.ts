import assert from "node:assert/strict";
import test from "node:test";
import { createModelRouterFromEnvironment } from "./config.js";

test("returns an empty router when AI is not configured", () => {
  const router = createModelRouterFromEnvironment({});
  assert.equal(router.list().length, 0);
});

test("composes an OpenAI-compatible provider from environment values", () => {
  const router = createModelRouterFromEnvironment({
    MONSTRO_AI_BASE_URL: "http://127.0.0.1:11434/v1",
    MONSTRO_AI_MODEL: "local-code-model",
    MONSTRO_AI_PROVIDER_ID: "local",
    MONSTRO_AI_CAPABILITIES: "code,reasoning,code",
    MONSTRO_AI_TIMEOUT_MS: "5000",
  });

  assert.equal(router.list().length, 1);
  assert.equal(router.resolve({ capability: "code", prompt: "build" }).id, "local");
  assert.equal(router.resolve({ capability: "reasoning", prompt: "plan" }).id, "local");
  assert.equal(router.list("vision").length, 0);
});

test("rejects partial or invalid AI environment configuration", () => {
  assert.throws(() => createModelRouterFromEnvironment({ MONSTRO_AI_BASE_URL: "http://localhost/v1" }), /configured together/);
  assert.throws(() => createModelRouterFromEnvironment({ MONSTRO_AI_MODEL: "model" }), /configured together/);
  assert.throws(() => createModelRouterFromEnvironment({ MONSTRO_AI_BASE_URL: "http://localhost/v1", MONSTRO_AI_MODEL: "model", MONSTRO_AI_CAPABILITIES: "code,telepathy" }), /Unknown MONSTRO AI capabilities/);
  assert.throws(() => createModelRouterFromEnvironment({ MONSTRO_AI_BASE_URL: "http://localhost/v1", MONSTRO_AI_MODEL: "model", MONSTRO_AI_TIMEOUT_MS: "0" }), /positive integer/);
});
