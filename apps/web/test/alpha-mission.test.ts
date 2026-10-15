import assert from "node:assert/strict";
import test from "node:test";
import { executeAlphaMission } from "../lib/alpha-mission";
import { requestAlphaMission } from "../lib/alpha-mission-client";

test("executes a bounded Alpha mission through the real core runtime", async () => {
  const result = await executeAlphaMission("Crie um protótipo verificável.");
  assert.equal(result.phase, "deliver");
  assert.equal(result.iteration, 1);
  assert.match(result.summary, /MONSTRO_ALPHA:Crie um protótipo verificável/);
  assert.match(result.artifact, /console\.log/);
});

test("rejects empty Alpha mission intent", async () => {
  await assert.rejects(() => executeAlphaMission("   "), /required/);
});

test("rejects oversized Alpha mission intent", async () => {
  await assert.rejects(() => executeAlphaMission("x".repeat(2001)), /2000/);
});

test("posts an intent and returns the Alpha mission result", async () => {
  let request: { input: string; init: RequestInit } | undefined;
  const result = await requestAlphaMission("Construa algo real.", async (input, init) => {
    request = { input, init };
    return Response.json({
      taskId: "alpha-1",
      phase: "deliver",
      iteration: 1,
      summary: "MONSTRO_ALPHA:Construa algo real.",
      artifact: "console.log('ok')",
    });
  });

  assert.equal(request?.input, "/api/alpha/mission");
  assert.equal(request?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(request?.init.body)), { intent: "Construa algo real." });
  assert.equal(result.phase, "deliver");
});

test("surfaces a readable API error", async () => {
  await assert.rejects(
    () => requestAlphaMission("", async () => Response.json(
      { error: "Mission intent is required." },
      { status: 400 },
    )),
    /Mission intent is required/,
  );
});
