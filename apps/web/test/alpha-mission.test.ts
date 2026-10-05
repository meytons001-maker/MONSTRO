import assert from "node:assert/strict";
import test from "node:test";
import { executeAlphaMission } from "../lib/alpha-mission";

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
